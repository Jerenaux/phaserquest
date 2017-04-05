/**
 * Created by Jerome on 28-10-16.
 */

var fs = require('fs');
var PF = require('pathfinding');
var clone = require('clone'); // used to clone objects, essentially used for clonick update packets
var rwc = require('random-weighted-choice'); // used to randomly decide which loot a monster should drop

var GameServer = {
    map: null, // object containing all the data about the world map
    mapReady: false, // is the server done processing the map or not
    // frequency of the server update loop ; rate at which the player and monsters objects will call their "update" methods
    // This is NOT the rate at which updates are sent to clients (see server.clientUpdateRate)
    updateRate: 1000/12,
    regenRate: 1000*2, // Rate at which the regenerate() method is called
    itemRespawnDelay: 1000*30, // Delay (ms) after which a respawnable item will respawn
    monsterRespawnDelay: 1000*30, // Delay (ms) after which a monster will respawn
    itemVanishDelay: 1000*9, // How long does dropped loot remain visible (ms)
    retryDelay: 1000*3, // Stuff don't respawn on cells occupied by players ; if a cell is occupied, the respawn call will retry after this amount of time (ms)
    walkUpdateDelay: 80, // How many ms between two updateWalk() calls
    fightUpdateDelay: 200, // How many ms between two updateFight() calls
    damageDelay: 1000, // How many ms before an entity can damage another one again
    positionCheckDelay: 1000, // How many ms before checkPosition() call
    lastItemID: 0, // ID of the last item object created
    lastMonsterID: 0,
    lastPlayerID: 0,
    AOIwidth: 34, // width in tiles of each AOI ; 6 AOIs horizontally in total
    AOIheight: 20, // height in tiles of each AOI ; 16 AOIs vertically in total
    nbConnectedChanged: false, // has the number of connected players changed since last update packet or not
    players: {}, // map of all connected players, fetchable by id
    socketMap: {}, // map of socket id's to the player id's of the associated players
    IDmap: {} // map of player id's to their mondo db uid's
};

module.exports.GameServer = GameServer;
module.exports.randomInt = randomInt;

var ObjectId = require('mongodb').ObjectID;
var spaceMap = require('../spaceMap.js').spaceMap;
var ChestArea = require('./chestarea.js').ChestArea;
var AOIutils = require('../AOIutils.js').AOIutils;
var AOI = require('./AOI.js').AOI;
var Player = require('./Player.js').Player;
var Monster = require('./Monster.js').Monster;
var Item = require('./Item.js').Item;

//A few helper functions
GameServer.addPlayerID = function(socketID,playerID){ // map a socket id to a player id
    GameServer.socketMap[socketID] = playerID;
};

GameServer.getPlayerID = function(socketID){
    return GameServer.socketMap[socketID];
};

GameServer.getPlayerAOIid = function(playerID){ // get the id of the AOI a given player is currently in
    return GameServer.players[playerID].getAOIid();
};

GameServer.getPlayer = function(socketID){ // returns the player corresponding to a specific *socket* ID
    return GameServer.players[GameServer.getPlayerID(socketID)];
};

GameServer.deleteSocketID = function(socketID){ // remove a socket id/player id mapping
  delete GameServer.socketMap[socketID];
};

// Create a map between the numerical id's and the string id's of elements of a collection
GameServer.makeIDmap = function(collection,map){
    Object.keys(collection).forEach(function(key) {
        var e = collection[key];
        map[e.id] = key;
    });
};

// =========================
// Code related to reading map and setting up world

GameServer.readMap = function(){
    GameServer.db = JSON.parse(fs.readFileSync('./assets/json/db.json').toString()); // Info about monsters, items, etc.
    GameServer.db.entities = JSON.parse(fs.readFileSync('./assets/json/entities_server.json').toString()); // locations of monsters, objects, chests...
    GameServer.db.client_entities = JSON.parse(fs.readFileSync('./assets/json/entities_client.json').toString()); // npc
    Object.assign(GameServer.db.entities,GameServer.db.client_entities); // merge the last two for convenience

    GameServer.db.itemsIDmap = {}; // Make a map to easily fetch string keys based on numerical id's
    GameServer.makeIDmap(GameServer.db.items,GameServer.db.itemsIDmap);

    fs.readFile('./assets/maps/minimap_server.json', 'utf8', function (err, data) {
        if (err) throw err;
        GameServer.map = JSON.parse(data);
        GameServer.objects = {};
        GameServer.layers = [];
        GameServer.tilesets = {};

        for (var l = 0; l < GameServer.map.layers.length; l++) {
            var layer = GameServer.map.layers[l];
            if (layer.type == 'objectgroup') {
                GameServer.objects[layer.name] = layer.objects;
            } else if (layer.type == 'tilelayer') {
                GameServer.layers.push(layer.data);
            }
        }
        for (var t = 0; t < GameServer.map.tilesets.length; t++) {
            var tileset = GameServer.map.tilesets[t];
            GameServer.tilesets[tileset.name] = tileset.tileproperties;
        }

        // Iterate over all tiles and work out AOIs and collisions
        AOIutils.nbAOIhorizontal = Math.ceil(GameServer.map.width/GameServer.AOIwidth);
        GameServer.AOIs = {}; // Maps AOI id to AOI object
        GameServer.dirtyAOIs = new Set(); // Set of AOI's whose update package have changes since last update
        GameServer.AOIfromTiles = new spaceMap(); // map tiles coordinates to AOI id (e.g. the tile (3,2) is in AOI 0)
        GameServer.collisionGrid = [];
        for (var y = 0; y < GameServer.map.height; y++) {
            var col = [];
            for (var x = 0; x < GameServer.map.width; x++) {
                // Work out AOI
                if(x%GameServer.AOIwidth == 0 && y%GameServer.AOIheight == 0){ // Create a new AOI at these coordinates
                    var area = new AOI(x,y,GameServer.AOIwidth,GameServer.AOIheight);
                    GameServer.AOIs[area.id] = area;
                }
                GameServer.AOIfromTiles.add(x,y,GameServer.AOIs[getIDfromCoords(x,y)]);
                // Work out collisions
                var collide = false;
                for (var l = 0; l < GameServer.layers.length; l++) {
                    var tile = GameServer.layers[l][y * GameServer.map.width + x];
                    if (tile) {
                        // The original BrowserQuest Tiled file doesn't use a collision layer; rather, properties are added to the
                        // tileset to indicate which tiles causes collisions or not. Which is why we have to check in the tileProperties
                        // if a given tile has the property "c" or not (= collision)
                        var tileProperties = GameServer.tilesets['tilesheet'][tile - 1];
                        if (tileProperties) {
                            if (tileProperties.hasOwnProperty('c')) {
                                collide = true;
                                break;
                            }
                        }
                    }
                }
                col.push(+collide); // "+" to convert boolean to int
            }
            GameServer.collisionGrid.push(col);
        }
        GameServer.PFgrid = new PF.Grid(GameServer.collisionGrid);
        GameServer.pathfinder = new PF.AStarFinder();

        GameServer.setUpDoors();
        GameServer.setUpEntities();
        GameServer.setUpChests();
        GameServer.setUpRoaming();
        GameServer.setLoops();
        console.log('Map read');
        GameServer.mapReady = true;
    });
};

GameServer.setUpDoors = function(){ // Set up teleports
    GameServer.doors = new spaceMap();
    for (var d = 0; d < GameServer.objects.doors.length; d++) {
        var door = GameServer.objects.doors[d];
        var position = GameServer.computeTileCoords(door.x, door.y);
        GameServer.doors.add(position.x, position.y, {
            to: {x:door.properties.x, y:door.properties.y},
            camera: (door.properties.hasOwnProperty('cx') ?
            {x:door.properties.cx, y:door.properties.cy}
                : null),
            orientation: door.properties.o
        });
    }
};

GameServer.setUpEntities = function(){ // Set up monsters & items
    GameServer.playersMap = new spaceMap();
    GameServer.items = new spaceMap();
    GameServer.monsters = new spaceMap();
    GameServer.monstersTable = {};
    for (var d = 0; d < GameServer.objects.entities.length; d++) {
        var entity = GameServer.objects.entities[d];
        if (!GameServer.db.entities.hasOwnProperty(entity.gid - 1961)) continue;
        var entityInfo = GameServer.db.entities[entity.gid - 1961];
        var position = GameServer.computeTileCoords(entity.x, entity.y);
        if (entityInfo.npc) {
            GameServer.collisionGrid[position.y][position.x] = 1;
        } else if (entityInfo.item) {
            var item = new Item(position.x,position.y-1,entityInfo.sprite,true,false,false); // respawn, not chest, not loot
            GameServer.addAtLocation(item);
        } else if (entityInfo.monster) {
            GameServer.addMonster(position,entityInfo.sprite);
        }
    }
};

GameServer.addMonster = function(position,sprite){ // Create a monster object and add it to all relevant data structures
    // position are the tile coordinates at which to create the monster
    // sprite is the name of the sprite of the monster, which also works as its string key in the JSON
    var monster = new Monster(position.x,position.y,sprite);
    GameServer.monstersTable[monster.id] = monster;
    GameServer.addAtLocation(monster);
};

GameServer.setUpChests = function(){ // Sets up chests and chest areas
    for (var d = 0; d < GameServer.objects.chests.length; d++) {
        var chest = GameServer.objects.chests[d];
        var position = GameServer.computeTileCoords(chest.x, chest.y);
        var chest = new Item(position.x,position.y,chest.properties.items,true,true,false); // respawn, chest, not loot
        GameServer.addAtLocation(chest);
    }

    // Chest areas are areas where a chest will spawn if all monsters are killed
    GameServer.chestareas = {};
    for (var d = 0; d < GameServer.objects.chestareas.length; d++) {
        var area = GameServer.objects.chestareas[d];
        var chestarea = new ChestArea(area.properties,GameServer.spawnHiddenChest);
        GameServer.chestareas[d] = chestarea;
        // Compute the size of the area
        var topleft = GameServer.computeTileCoords(area.x,area.y);
        var bottomright = GameServer.computeTileCoords(area.x+area.width,area.y+area.height);
        // Count all monsters within that area, to configure the chest area properly
        for(var x = topleft.x; x < bottomright.x; x++) {
            for (var y = topleft.y; y < bottomright.y; y++) {
                var monster = GameServer.monsters.getFirst(x,y);
                if(monster){
                    monster.chestArea = chestarea;
                    chestarea.incrementAll();
                }
            }
        }
    }
};

GameServer.setUpRoaming = function(){ // Sets up packs of randomly positioned monsters within an area
    for (var d = 0; d < GameServer.objects.roaming.length; d++) {
        var roaming =  GameServer.objects.roaming[d];
        var positions = new Set(); // use a set of positions to avoid having multiple monsters on the same tile
        while(positions.size < roaming.properties.nb){
            var x = randomInt(roaming.x, (roaming.x+roaming.width));
            var y = randomInt(roaming.y, (roaming.y+roaming.height));
            positions.add(GameServer.computeTileCoords(x,y));
        }
        positions.forEach(function(pos){
            GameServer.addMonster(pos,roaming.type);
        });
    }
};

GameServer.setLoops = function(){ // Sets up the server update loop, and the regenration loop
    setInterval(GameServer.update,GameServer.updateRate);
    setInterval(GameServer.regenerate,GameServer.regenRate);
};

// ==============================
// Code related to managin the player: create new one, fetch from db, remove, ...

GameServer.checkSocketID = function(id){ // check if no other player is using same socket ID
    return (GameServer.getPlayerID(id) === undefined);
};

GameServer.checkPlayerID = function(id){ // check if no other player is using same player ID
    return (GameServer.players[id] === undefined);
};

GameServer.addNewPlayer = function(socket,data){
    // data is the data object sent by the client to request the creation of a new plaer
    if(!data.name || data.name.length == 0) return;
    var player = new Player(data.name);
    var document = player.dbTrim();
    GameServer.server.db.collection('players').insertOne(document,function(err){
        if(err) throw err;
        var mongoID = document._id.toString(); // The Mongo driver for NodeJS appends the _id field to the original object reference
        player.setIDs(mongoID,socket.id);
        GameServer.finalizePlayer(socket,player);
        GameServer.server.sendID(socket,mongoID);
    });
};

GameServer.loadPlayer = function(socket,id){
    GameServer.server.db.collection('players').findOne({_id: new ObjectId(id)},function(err,doc){
        if(err) throw err;
        if(!doc) {
            GameServer.server.sendError(socket);
            return;
        }
        var player = new Player();
        var mongoID = doc._id.toString();
        player.setIDs(mongoID,socket.id);
        player.getDataFromDb(doc);
        GameServer.finalizePlayer(socket,player);
    });
};

GameServer.finalizePlayer = function(socket,player){
    GameServer.addPlayerID(socket.id,player.id);
    GameServer.embedPlayer(player);
    GameServer.server.sendInitializationPacket(socket,GameServer.createInitializationPacket(player.id));
};

GameServer.createInitializationPacket = function(playerID){
    // Create the packet that the client will receive from the server in order to initialize the game
    return {
        player: GameServer.players[playerID].trim(), // info about the player
        nbconnected: GameServer.server.getNbConnected(),
        nbAOIhorizontal: AOIutils.nbAOIhorizontal, // info about AOI's
        lastAOIid: AOIutils.lastAOIid
    };
};

GameServer.embedPlayer = function(player){
    // Add the player to all the relevant data structures
    GameServer.players[player.id] = player;
    GameServer.nbConnectedChanged = true;
    GameServer.addAtLocation(player);
    player.setLastSavedPosition();
};

GameServer.savePlayer = function(player){
    // Save the progress of a player
    GameServer.server.db.collection('players').updateOne(
        {_id: new ObjectId(player.getMongoID())},
        {$set: player.dbTrim() },
        function(err){
            if(err) throw err;
    });
    player.setLastSavedPosition();
};

GameServer.deletePlayer = function(id){
    GameServer.server.db.collection('players').deleteOne({_id: new ObjectId(id)},function(err){
        if(err) throw err;
    });
};

GameServer.removePlayer = function(socketID){
    var player = GameServer.getPlayer(socketID);
    GameServer.removeFromLocation(player);
    player.setProperty('connected',false);
    player.die();
    var AOIs = player.listAdjacentAOIs(true);
    AOIs.forEach(function(aoi){
        GameServer.addDisconnectToAOI(aoi,player.id);
    });
    delete GameServer.players[player.id];
    GameServer.nbConnectedChanged = true;
    GameServer.deleteSocketID(socketID);
};

GameServer.revivePlayer = function(playerID){
    var player = GameServer.players[playerID];
    if(player) player.revive();
};

// ==================================
// Code related to managing the position of the game objects in the world

GameServer.getSpaceMap = function(entity){
    // Get the spatial data structure corresponding to the kind of entity  you want to deal with
    switch(entity.category){
        case 'item':
            return GameServer.items;
            break;
        case 'player':
            return GameServer.playersMap;
            break;
        case 'monster':
            return GameServer.monsters;
            break;
    }
};

GameServer.addAtLocation = function(entity){
    // Add some entity to all the data structures related to position (i.e. the spaceMap of the category of the entity, and the AOI)
    var map = GameServer.getSpaceMap(entity);
    map.add(entity.x,entity.y,entity);
    GameServer.AOIfromTiles.getFirst(entity.x,entity.y).addEntity(entity,null);
};

GameServer.moveAtLocation = function(entity,fromX, fromY,toX,toY){
    // Update the position of an entity in all data structures related to position (spaceMap and AOI)
    var map = GameServer.getSpaceMap(entity);
    map.move(fromX, fromY, toX, toY, entity);
    var AOIfrom = GameServer.AOIfromTiles.getFirst(fromX,fromY);
    var AOIto = GameServer.AOIfromTiles.getFirst(entity.x,entity.y);
    if(AOIfrom.id != AOIto.id){
        entity.setProperty('aoi',AOIto.id);
        var previousAOI = AOIfrom.id;
        AOIfrom.deleteEntity(entity);
        AOIto.addEntity(entity,previousAOI);
    }
};

GameServer.removeFromLocation = function(entity){
    // Remove an entity from all data structures related to position (spaceMap and AOI)
    var map = GameServer.getSpaceMap(entity);
    map.delete(entity.x,entity.y,entity);
    GameServer.AOIfromTiles.getFirst(entity.x,entity.y).deleteEntity(entity);
};

GameServer.determineStartingPosition = function(){
    // Determine where a new player should appear for the first time in the game
    var checkpoints = GameServer.objects.checkpoints;
    var startArea = checkpoints[Math.floor(Math.random()*checkpoints.length)];
    var x = randomInt(startArea.x, (startArea.x+startArea.width));
    var y = randomInt(startArea.y, (startArea.y+startArea.height));
    return {x:Math.floor(x/GameServer.map.tilewidth),y:Math.floor(y/GameServer.map.tileheight)};
};

GameServer.computeTileCoords = function(x,y){ // Convert pixel coordinates to tile coordinates
    return {
        x: Math.ceil(x/GameServer.map.tilewidth),
        y: Math.ceil(y/GameServer.map.tileheight)
    };
};

GameServer.adjacentNoDiagonal = function(a,b){ // Check if two entites a and b are on non-diagonally adjacent tiles
    var Xdiff = a.x-b.x;
    var Ydiff = a.y-b.y;
    if(Xdiff == 1 && Ydiff == 0){
        return 1;
    }else if(Xdiff == 0 && Ydiff == 1) {
        return 2;
    }else if(Xdiff == -1 && Ydiff == 0){
        return 3;
    }else if(Xdiff == 0 && Ydiff == -1) {
        return 4;
    }else if(Xdiff == 0 && Ydiff == 0){ // The two entities are on the same cell
        return -1;
    }else{ // The two entities are not on adjacent cells, nor on the same one
        return 0;
    }
};

GameServer.findFreeAdjacentCell = function(x,y){
    // When two entities are on the same tile, look for the first free adjacent tile to move one to
    var adj = [[-1,0],[1,-1],[1,1],[-1,1]];
    for(var c = 0; c < 4; c++) {
        x += adj[c][0];
        y += adj[c][1];
        if(GameServer.collisionGrid[y][x] == 0) return {x:x,y:y};
    }
};

GameServer.getCurrentPosition = function(id){
    var player = GameServer.getPlayer(id);
    if(!player) return null;
    return {x:player.x,y:player.y};
};

GameServer.convertPath = function(p){
    // The pathfinding for players and monsters are done using two different pathfinding libraries, with slightly different
    // format to represent the coordinates; this function converts the array format into the object format
    var path = [];
    for(var i = 0; i < p.length; i++){
        path.push({x:p[i][0],y:p[i][1]});
    }
    return path;
};

GameServer.handlePath = function(path,action,orientation,socket){ // Processes a path sent by a client
    // Path is the array of tiles to travel through
    // Action is a small object indicating what to do at the end of the path (pick up loot, attack monster ..)
    // orientation is a value between 1 and 4 indicating the orientation the player should have at the end of the path
    // socket is the socket of the client who sentt the path
    var player = GameServer.getPlayer(socket.id);
    if(!player || !player.alive) return false;

    if(path.length > 60){
        // The only way to have a path that long is to request it using the console instead of the normal interface
        console.log('Path too long');
        return false;
    }

    if(manhattanDistance(path[0].x,path[0].y,path[path.length-1].x,path[path.length-1].y) > GameServer.AOIheight+8){
        // Same ; used to prevent travelling through more than two AOI's at once, because the AOI-related updates take place only when a path is finished
        console.log('Distance too big');
        console.log(manhattanDistance(path[0].x,path[0].y,path[path.length-1].x,path[path.length-1].y));
        return false;
    }

    if(Math.abs(path[0].x - player.x) > 1 || Math.abs(path[0].y - player.y) > 1){ // Check for mismatch between client-side and server-side coordinates
        console.log('Wrong start coordinates');
        console.log('Server : '+player.x+', '+player.y);
        console.log('Client : '+path[0].x+', '+path[0].y);
        return false;
    }

    for(var p = 1; p < path.length; p++){
        if(!GameServer.adjacent(path[p],path[p-1])){ // Check if the provided path is continuous, without any jumps in it (would be cheating)
            console.log('Jump in path');
            return false;
        }
        if(GameServer.collisionGrid[path[p].y][path[p].x]){ // Check that the path doesn't contain collidable tiles (would be cheating)
            console.log('Obstacle on path');
            return false;
        }
    }

    var departureTime = Date.now() - socket.latency; // Needed the corrected departure time for the update loop (updateWalk())
    player.setRoute(path,departureTime,socket.latency,action,orientation);
    if(action && action.action == 3){ // fight
        var monster = GameServer.monstersTable[action.id];
        if(monster.alive) player.setTarget(monster);
    }
    if(player.inFight && action && action.action != 3) player.endFight();
    return true;
};

GameServer.adjacent = function(A,B){
    return !(Math.abs(A.x - B.x) > 1 || Math.abs(A.y - B.y) > 1);
};

GameServer.respawnCount = function(x,y,object,callback,delay){ // Sets timer to respawn a monster or item
    // object is the game object to respawn (a monster or an item)
    // callback is the function that should be call to make it respawn
    // delay is the amoutn of ms to wait before calling the callback
    setTimeout(GameServer.respawnSomething,delay,x,y,object,callback);
};

GameServer.respawnSomething = function(x,y,object,callback){
    // Check if the tile is not occupied by something else ; if it is, retry after a short while
    // object is the game object to respawn (a monster or an item)
    // callback is the function that should be call to make it respawn
    if( GameServer.monsters.getFirstFiltered(x,y,['alive']) ||
        GameServer.playersMap.getFirstFiltered(x,y,['alive']) ||
        GameServer.items.getFirstFiltered(x,y,['visible'])
    ) {
        GameServer.respawnCount(x,y,object,callback,GameServer.retryDelay); // 3s retry delay
        return;
    }
    callback.call(object);
};

GameServer.checkDoor = function(player){ // Check if the player ended up on a teleport
    var door = GameServer.doors.getFirst(player.x,player.y);
    if(door) player.teleport(door);
};

GameServer.checkItem = function(player){ // Check if the player ended up on an item
    var item = GameServer.items.getFirstFiltered(player.x,player.y,['visible'],['inChest']); // should be visible but not in a chest
    if(item) if(player.applyItem(item)) item.pick();
};

GameServer.checkMonster = function(player){ // Check if the player is adjacent to an aggressive monster that should attack him
    var adj = [[-1,-1],[0,-1],[1,-1],[-1,0],[0,0],[1,0],[-1,1],[0,1],[1,1]];
    for(var c = 0; c < 9; c++) {
        var x = player.x + adj[c][0];
        var y = player.y + adj[c][1];
        var monster = GameServer.monsters.getFirstFiltered(x,y,['alive','aggro']);
        if(monster && !GameServer.areFighting(monster,player)) GameServer.setUpFight(player,monster);
    }
};

GameServer.checkAction = function(player){
    if(player.route.action){
        var action = player.route.action;
        if(action.action == 3){ // fight
            var monster = GameServer.monstersTable[action.id];
            if(!GameServer.areFighting(player,monster)) GameServer.setUpFight(player,monster);
        }else if(action.action == 4){ // chest
            var chest = GameServer.items.getFirstFiltered(action.x,action.y,['visible','chest']);
            if(!chest) return;
            if(!GameServer.adjacent(chest,player)) return;
            chest.open();
        }
    }
};

GameServer.checkSave = function(player){
    // save the progress of the player if the distance to his last saved position is greater than 30,
    // but only if he's outdoor (x < 92). Saving position indoor might cause camera issues when reloading the game.
    if(player.x < 92 && manhattanDistance(player.x,player.y,player.lastSavedPosition.x,player.lastSavedPosition.y) > 30){
        GameServer.savePlayer(player);
    }
};

// ====================================
// Code related to fighting and related concepts

GameServer.areFighting = function(A,B){
    return (A.hasFoe(B) && B.hasFoe(A) && (A.inFight && B.inFight));
};

GameServer.setUpFight = function(A,B){
    if(!B || !A) return;
    var alreadyInFightA = A.inFight;
    var alreadyInFightB = B.inFight;
    A.startFight(B);
    B.startFight(A);
    if(!alreadyInFightA) A.damage();
    if(!alreadyInFightB) B.damage();
};

GameServer.handleKill = function(killer,target){
    setTimeout(function(){
        if(GameServer.db.monsters[target.name]) killer.updatePacket.addKilled(GameServer.db.monsters[target.name].id);
    },400);
};

GameServer.formatLootTable = function(table){
    // Convert the loot information from the JSON in a format that the rwc module will be able to use
    if(!table) return;
    var lootTable = [];
    var sum = 0;
    Object.keys(table).forEach(function(itm){
        lootTable.push({weight:table[itm],id:itm});
        sum += table[itm];
    });
    if(sum < 10) {
        lootTable.push({weight:(10-sum),id:'none'});
    }
    return lootTable;
};

GameServer.dropLoot = function(table,x,y){
    // Weighted random selection of what item should be dropped by a monster
    var defaultTable = [
        {weight:5, id:'none'},
        {weight:4, id:'item-flask'},
        {weight:1, id:'item-burger'}
    ];
    var lootTable = table || defaultTable;
    var itm = rwc(lootTable);
    if(itm && itm != 'none'){
        var item = new Item(x,y,itm,false,false,true);  // no respawn, not chest, loot
        item.makeTemporary();
        GameServer.addAtLocation(item);
    }
};

GameServer.spawnHiddenChest = function(properties){ // If all the monsters in a chest area have been killed, spawn the corresponding chest
    if(GameServer.items.getFirstFiltered(properties.x,properties.y,['visible'])) return;
    var chest = new Item(properties.x,properties.y,properties.items,false,true,false);  // no respawn, chest, not loot
    setTimeout(function(properties,chest){
        GameServer.addAtLocation(chest);
    },500,properties,chest);
};

// ============================
// Upate code for the game objects

GameServer.update = function(){ // called every 1/12 of sec
    Object.keys(GameServer.players).forEach(function(key) {
        var player = GameServer.players[key];
        if(player.alive) player.update();
    });
    Object.keys(GameServer.monstersTable).forEach(function(key) {
        var monster = GameServer.monstersTable[key];
        if(monster.alive) monster.update();
    });
};

GameServer.regenerate = function(){
    Object.keys(GameServer.players).forEach(function(key) {
        var player = GameServer.players[key];
        if(player.alive && player.life < player.maxLife) player.regenerate();
    });
};

GameServer.updatePlayers = function(){ //Function responsible for setting up and sending update packets to clients
    Object.keys(GameServer.players).forEach(function(key) {
        var player = GameServer.players[key];
        var localPkg = player.getIndividualUpdatePackage(); // the local pkg is player-specific
        var globalPkg = GameServer.AOIs[player.aoi].getUpdatePacket(); // the global pkg is AOI-specific
        var individualGlobalPkg = clone(globalPkg,false); // clone the global pkg to be able to modify it without affecting the original
        // player.newAOIs is the list of AOIs about which the player hasn't checked for updates yet
        for(var i = 0; i < player.newAOIs.length; i++){
            individualGlobalPkg.synchronize(GameServer.AOIs[player.newAOIs[i]]); // fetch updates from the new AOIs
        }
        individualGlobalPkg.removeEcho(player.id); // remove redundant information from multiple update sources
        if(individualGlobalPkg.isEmpty()) individualGlobalPkg = null;
        if(individualGlobalPkg === null && localPkg === null && !GameServer.nbConnectedChanged) return;
        var finalPackage = {};
        if(individualGlobalPkg) finalPackage.global = individualGlobalPkg.clean();
        if(localPkg) finalPackage.local = localPkg.clean();
        if(GameServer.nbConnectedChanged) finalPackage.nbconnected = GameServer.server.getNbConnected();
        GameServer.server.sendUpdate(player.socketID,finalPackage);
        player.newAOIs = [];
    });
    GameServer.nbConnectedChanged = false;
    GameServer.clearAOIs(); // erase the update content of all AOIs that had any
};

// =================================
// Code related to AOI management

GameServer.clearAOIs = function(){
    GameServer.dirtyAOIs.forEach(function(aoi){
        GameServer.AOIs[aoi].clear();
    });
    GameServer.dirtyAOIs.clear();
};

GameServer.listAOIsFromSocket = function(socketID){
    return GameServer.getPlayer(socketID).listAdjacentAOIs(false);
};

GameServer.handleAOItransition = function(entity,previous){
    // When a player moves from one AOI to another, identify which AOIs should be notified and update them
    var AOIs = entity.listAdjacentAOIs(true);
    if(previous){
        var previousAOIs = AOIutils.listAdjacentAOIs(previous);
        // Array_A.diff(Array_B) returns the elements in A that are not in B
        // This is used because only the AOIs that are now adjacent, but were not before, need an update. Those who where already adjacent are up-to-date
        AOIs = AOIs.diff(previousAOIs);
    }
    AOIs.forEach(function(aoi){
        if(entity.constructor.name == 'Player') entity.newAOIs.push(aoi); // list the new AOIs in the neighborhood, from which to pull updates
        GameServer.addObjectToAOI(aoi,entity);
    });
};

GameServer.addObjectToAOI = function(aoi,entity){
    GameServer.AOIs[aoi].updatePacket.addObject(entity);
    GameServer.dirtyAOIs.add(aoi);
};

GameServer.updateAOIproperty = function(aoi,category,id,property,value) {
    GameServer.AOIs[aoi].updatePacket.updateProperty(category, id, property, value);
    GameServer.dirtyAOIs.add(aoi);
};

GameServer.updateAOIroute = function(aoi,category,id,route){
    GameServer.AOIs[aoi].updatePacket.updateRoute(category, id, route);
    GameServer.dirtyAOIs.add(aoi);
};

GameServer.addDisconnectToAOI = function(aoi,playerID) {
    GameServer.AOIs[aoi].updatePacket.addDisconnect(playerID);
    GameServer.dirtyAOIs.add(aoi);
};

// =============================
// Miscellaneous

function randomInt (low, high) {
    return Math.floor(Math.random() * (high - low) + low);
}

function manhattanDistance(xA,yA,xB,yB){
    return Math.abs(xA-xB) + Math.abs(yA-yB);
}

function getIDfromCoords(x,y){
    // Map x and y coordinates to the id of the AOI that the tile will belong to
    return Math.floor(x/GameServer.AOIwidth)+(AOIutils.nbAOIhorizontal*Math.floor(y/GameServer.AOIheight));
}

Array.prototype.diff = function(a) { // returns the elements in the array that are not in array a
    return this.filter(function(i) {return a.indexOf(i) < 0;});
};