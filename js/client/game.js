
/*
 * Author: Jerome Renaux
 * E-mail: jerome.renaux@gmail.com
 */

"use strict";
var Game = {
    borderPadding: 10, // size of the gray border of the game window
    HUDheight: 32, // height of the HUD bar at the bottom (with life etc.)
    achievementsHolderWidth: 850,
    barY: 0, // y position of that very same bar
    nbGroundLayers: 4, // number of tilemap layers corresponding to "ground" elements (ground, grass, water, cliffs), vs high elements (trees, houses, ...)
    defaultOrientation: 4, // Face down by default
    playerSpeed: 120, // number of ms that the movement tween takes to cross one tile (the lower the faster)
    playerLife: 100, // Max health of a player
    cursor: 'url(/assets/sprites/hand.png), auto', // image of the mouse cursor in normal circumstances
    talkCursor: 'url(/assets/sprites/talk.png), auto', // image of the cursor when hovering NPC
    lootCursor: 'url(/assets/sprites/loot.png), auto', // image of cursors when hovering loot
    fightCursor: 'url(/assets/sprites/sword.png), auto', // image of cursor when hovering monster
    markerPosition: new Phaser.Point(), // current position of the square marker indicating the highlighted tile
    previousMarkerPosition: new Phaser.Point(), // previous position of that marker
    cameraFollowing: true, // is the camera centered on the player
    mapWideningY: 54, // y coordinate (in tiles) of the region of the map above which the bounds of the world are wider
    speechBubbleCornerSize: 5, // size of the sprite used to make the corners of the speech bubbles
    healthBarWidth: 179, // width of the sprite representing the life of the player
    nbConnected: 0, // number of players connected to the game
    playerIsInitialized: false, // has the client received data from the server and created the world?
    inDoor: false, // is the player currently in an indoors location
    HPdelay: 100, // Delay before displaying hit points
    maxChatLength: 300, // Max length of text to input in chat
    latency: 0, // Initial latency of the client; continuously updated by values from server
    charactersPool: {}, // Map of the players in the game, accessed by their player id
    clickDelay: Phaser.Timer.SECOND * 0.2, // minimum time between player mouse clicks
    clickEnabled: true // bool used to check if the player has clicked faster than the click delay
};
// used to map the orientation of the player, stored as a number, to the actual name of the orientation
// (used to select the right animations to play, by name)
var orientationsDict = {
    1: 'left',
    2: 'up',
    3: 'right',
    4: 'down'
};

Game.init = function(){
    Game.easystar = new EasyStar.js();
    game.canvas.style.cursor = Game.cursor; // Sets the pointer to hand sprite
};

Game.preload = function() {
    game.load.tilemap('map', 'assets/maps/minimap_client.json', null, Phaser.Tilemap.TILED_JSON);
    game.load.spritesheet('tileset', 'assets/tilesets/tilesheet.png',32,32);
    game.load.atlasJSONHash('atlas4', 'assets/sprites/atlas4.png', 'assets/sprites/atlas4.json'); // Atlas of monsters
    game.load.spritesheet('bubble', 'assets/sprites/bubble2.png',5,5); // tilesprite used to make speech bubbles
    game.load.spritesheet('life', 'assets/sprites/lifelvl.png',5,18); // tilesprite used to make lifebar
    game.load.audio('sounds','assets/audio/sounds.mp3','assets/audio/sounds.ogg'); // audio sprite of all sound effects
    game.load.json('entities', 'assets/json/entities_client.json'); // Basically a list of the NPC, mapping their id to the key used in other JSON files
};

// Makes a map mapping the numerical id's of elements of a collection to their names (their names being the keys used to fetch relevant data from JSON files)
Game.makeIDmap = function(collection,map){
    Object.keys(collection).forEach(function(key) {
        var e = collection[key];
        map[e.id] = key;
    });
};

Game.create = function() {
    Game.HUD = game.add.group(); // Group containing all objects involved in the HUD
    Game.HUD.add(game.add.sprite(0, 0, 'atlas1','border')); // Adds the gray border of the game
    Game.displayLoadingScreen(); // Display the loading screen

    // A few maps mapping the name of an element (a monster, npc, item...) to its properties
    // Put before other functions, which might need it
    Game.itemsInfo = Game.db.items;
    Game.npcInfo = Game.db.npc;
    Game.monstersInfo = Game.db.monsters;
    Game.findLocationAchievements(); // Scan the list of location-based achievements and store them somewhere

    // A few maps mapping numerical id's to string keys
    Game.itemsIDmap = {};
    Game.monstersIDmap = {};
    Game.makeIDmap(Game.itemsInfo, Game.itemsIDmap);
    Game.makeIDmap(Game.monstersInfo, Game.monstersIDmap);
    Game.entities = game.add.group(); // Group containing all the objects appearing on the map (npc, monster, items, players ...)
    Game.scenery = game.add.group(); // Group containing all the animated sprites generated from the map

    Game.displayMap(); // Reads the Tiled JSON to generate the map, manage layers, create collision array for the pathfinding and make a dictionary of teleports
    //Game.displayScenery(); // Finds all "scenery" tiles in the map and replace them by animated sprites
    Game.displayNPC(); // Read the Tiled JSON and display the NPC

    Game.createMarker(); // Creates the marker following the pointer that highlight tiles
    Game.makeHPtexts(); // Creates a pool of text elements to use to display HP
    Game.addSounds(); // Add the sounds of the game to some global object

    // Factories used to fecth unused sprites before creating new ones (or creating new ones when no other available)
    Game.playerFactory = new Factory(function(x,y,key){
        return new Player(x,y,key);
    });
    Game.itemFactory = new Factory(function(x,y,key){
        return new Item(x, y, key);
    });
    Game.monsterFactory = new Factory(function(x,y,key){
        return new Monster(x, y, key);
    });

    Client.requestData();
};


// Main update function; processes the global update packages received from the server
Game.updateWorld = function(data) { // data is the update package from the server
    var createdPlayers = [];
    if(data.newplayers) {
        for (var n = 0; n < data.newplayers.length; n++) {
            Game.createPlayer(data.newplayers[n]);
            createdPlayers.push(data.newplayers[n].id);
        }
        if (data.newplayers.length > 0) Game.sortEntities(); // Sort entitites according to y coordinate to make them render properly above each other
    }

    // Create new monsters and items and store them in the appropriate maps
    if(data.newitems) Game.populateTable(Game.itemsTable,data.newitems,Game.createItem);
    if(data.newmonsters) {
        Game.populateTable(Game.monstersTable,data.newmonsters,Game.createMonster);
        Game.sortEntities();
    }

    for (var n = 0; n < createdPlayers.length; n++) {
        var player = Game.charactersPool[createdPlayers[n]];
        if(player.inFight){
            player.target = Game.monstersTable[player.targetID]; // ultimately, target is object, not ID
            player.fight();
        }
    }

    if(data.disconnected) { // data.disconnected is an array of disconnected players
        for (var i = 0; i < data.disconnected.length; i++) {
            Game.removePlayer(Game.charactersPool[data.disconnected[i]],true); // animate death
        }
    }

    // data.items, data.players and data.monsters are associative arrays mapping the id's of the entities
    // to small object indicating which properties need to be updated. The following code iterate over
    // these objects and call the relevant update functions.
    if(data.items) Game.traverseUpdateObject(data.items,Game.itemsTable,Game.updateItem);
    // "Status" updates ; used to update some properties that need to be set before taking any real action on the game objects
    if(data.players) Game.traverseUpdateObject(data.players,Game.charactersPool,Game.updatePlayerStatus);
    if(data.monsters) Game.traverseUpdateObject(data.monsters,Game.monstersTable,Game.updateMonsterStatus);
    // "Action" updates
    if(data.players) Game.traverseUpdateObject(data.players,Game.charactersPool,Game.updatePlayerAction);
    if(data.monsters) Game.traverseUpdateObject(data.monsters,Game.monstersTable,Game.updateMonsterAction);
};
// For each element in arr, call the callback on it and store the result in the map 'table'
Game.populateTable = function(table,arr,callback){
    for(var i = 0; i < arr.length; i++) {
        var data = arr[i];
        // The callback receives the object received from the server as an argument, uses the relevant factory to create
        // the proper sprite, and returns that sprite
        var object = callback(data);
        object.id = data.id;
        table[data.id] = object;
    }
};
// For each element in obj, call callback on it
Game.traverseUpdateObject = function(obj,table,callback){
    Object.keys(obj).forEach(function (key) {
        if(table[key]) callback(table[key],obj[key]);
    });
};

// CREATION CODE
// These functions are supposed to return a sprite, whether by creating one from scratch, recycling and old one or
// fetching the appropriate already existing one, based on the info in the 'data' packer from the server
Game.createMonster = function(data){ // data contains the data from the server on the new entity to create
    var monster = (Game.monstersTable[data.id] ?
            Game.monstersTable[data.id] :
            Game.monsterFactory.next(data.x * Game.map.tileWidth, data.y * Game.map.tileHeight, 'atlas4')
    );
    monster.setUp(Game.monstersIDmap[data.monster]);
    Game.updateMonsterStatus(monster,data);
    Game.updateMonsterAction(monster,data);
    return monster;
};

Game.createItem = function(data) { // data contains the data from the server on the new entity to create
    var item;
    if(Game.itemsTable[data.id]) {
        item = Game.itemsTable[data.id]
    }else{
        item = Game.itemFactory.next(data.x * Game.map.tileWidth, data.y * Game.map.tileHeight, 'atlas3');
        item.setUp(Game.itemsIDmap[data.itemID], data.chest, data.inChest, data.visible, data.respawn, data.loot);
    }
    Game.updateItem(item,data);
    return item;
};

Game.createPlayer = function(data){ // data contains the data from the server on the new entity to create
    var player;
    if(Game.charactersPool[data.id]){
        player = Game.charactersPool[data.id];
    }else{
        player = Game.newPlayer(data.x,data.y,data.id);
    }
    if(!data.alive) player.visible = false;
    Game.setUpPlayer(player,data);
    Game.updatePlayerStatus(player,data);
    Game.updatePlayerAction(player,data);
    Game.displayedPlayers.add(player.id);
};

Game.newPlayer = function(x,y,id){
    var player = Game.playerFactory.next(x*Game.map.tileWidth,y*Game.map.tileHeight,'atlas3');
    player.orientation = Game.defaultOrientation;
    player.id = id;
    Game.entities.add(player);
    Game.charactersPool[id] = player;
    Game.sortEntities();
    return player;
};

Game.setUpPlayer = function(player,data){ // data contains the data from the server on the new entity to create
    player.setName(data.name);
    player.speed = Game.playerSpeed;
    player.orientation = Game.defaultOrientation;
};

Game.fadeInTween = function(object){ // Fade-in effect used to spawn items and monsters
    object.alpha = 0;
    var tween = game.add.tween(object);
    tween.to({alpha: 1}, Phaser.Timer.SECOND/2);
    tween.start();
};

// UPDATE CODE

Game.updatePlayerStatus = function(player,info){ // info contains the updated data from the server
    if(info.connected == false){
        Game.removePlayer(player,true);
        return;
    }
    if(info.x && info.y) player.position.set(info.x*Game.map.tileWidth, info.y*Game.map.tileHeight);

    if(info.aoi){ // Update the id of the AOI that the player is in
        player.aoi = info.aoi;
        if(player.isPlayer) Game.updateDisplayList();
    }

    if(info.alive == false && player.alive == true) player.flagForDeath();
    if(info.weapon) Game.updateEquipment(player,info.weapon);
    if(info.armor) Game.updateEquipment(player,info.armor);
    if(info.weapon || info.armor) player.idle(false); // If an equipment change has taken place, need to resume idling animation
    if(info.targetID !== undefined) player.target = (info.targetID ? Game.monstersTable[info.targetID] : null);
};

Game.updateDisplayList = function(){
    // Whenever the player moves to a different AOI, for each player displayed in the game, check if it will still be
    // visible from the new AOI; if not, remove it
    if(!Game.displayedPlayers) return;
    var adjacent = AOIutils.listAdjacentAOIs(Game.player.aoi);
    Game.displayedPlayers.forEach(function(pid){
        var p = Game.charactersPool[pid];
        // check if the AOI of player p is in the list of the AOI's adjacent to the main player
        if(p) if(adjacent.indexOf(p.aoi) == -1) Game.removePlayer(p,false); // false: don't animate death
    });
};

Game.updateEquipment = function(player,eqID){
    var equipment = Game.itemsIDmap[eqID];
    var itemInfo = Game.itemsInfo[equipment];
    if(itemInfo.type == 1){ // weapon
        player.equipWeapon(equipment);
    }else if(itemInfo.type == 2){ // armor
        player.equipArmor(equipment);
    }
};

Game.updatePlayerAction = function(player,info){ // info contains the updated data from the server
    if(info.alive == true && player.alive == false) player.respawn();
    if(!player.alive) return;
    if(info.alive == false && player.alive == true){
        if(!player.isPlayer){ // only for other players; for self, attackAndDisplay will be used instead
            var hitter = Game.monstersTable[info.lastHitter];
            if(hitter) hitter.attack();
            player.delayedDeath(500);
        }
        return;
    }
    if (!player.isPlayer && info.route) Game.moveCharacter(player.id,info.route.end,info.route.orientation,info.route.delta);
    if(info.inFight == false && player.inFight == true){
        player.endFight();
    }else if(info.inFight == true && player.inFight == false) {
        player.fight();
    }
};

Game.updateMonsterStatus = function(monster,info){ // info contains the updated data from the server
    if(info.alive == false && monster.alive == true){
        monster.flagForDeath();
        monster.delayedDeath(500);
        return;
    }
    if(info.x && info.y) monster.position.set(info.x*Game.map.tileWidth,info.y*Game.map.tileHeight);
    if(info.targetID !== undefined) monster.target = Game.charactersPool[info.targetID];
};

Game.updateMonsterAction = function(monster,info){ // info contains the updated data from the server
    if(info.alive == false && monster.alive == true){
        var hitter = Game.charactersPool[info.lastHitter];
        if(hitter) hitter.attack();
        return;
    }else if(info.alive == true && monster.alive == false){
        monster.respawn();
    }
    if (info.route) Game.moveMonster(monster.id,info.route.path, info.route.delta);
    if(info.inFight == false && monster.inFight == true){
        monster.endFight();
    }else if(info.inFight == true && monster.inFight == false) {
        monster.fight();
    }
};

Game.updateItem = function(item,info){ // info contains the updated data from the server
    if(info.visible == false && item.alive == true) {
        item.remove();
    }else if(info.visible == true && item.alive == false){
        item.respawn();
    }
    if(info.inChest == false && item.inChest == true) item.open();
};

Game.updateSelf = function(data){
    // Whereas updateWorld processes the global updates from the server about entities in the world, updateSelf
    // processes updates specific to the player, visible only to him
    if(data.life !== undefined){
        Game.player.life = data.life;
        Game.player.updateLife();
    }
    if(data.x != undefined && data.y != undefined){
        if(!Game.player.alive) Game.player.respawn(); // A change of position is send via personal update package only in case of respawn, so respawn is called immediately
        Game.player.position.set(data.x*Game.map.tileWidth, data.y*Game.map.tileHeight);
        Game.followPlayer();
    }
    // data.hp is an array of "hp" objects, which contain info about hit points to display over specific targets
    if(data.hp !== undefined) {
        for (var h = 0; h < data.hp.length; h++) {
            var hp = data.hp[h];
            if (hp.target == false) { // The HP should appear above the player
                if(hp.from !== undefined){
                    var attacker = Game.monstersTable[hp.from];
                    attacker.attackAndDisplay(-(hp.hp));
                }else{
                    Game.player.displayHP(hp.hp, 0);
                }
            } else if (hp.target == true) { // The HP should appear above the target monster
                Game.player.attackAndDisplay(-(hp.hp));
            }
        }
    }
    if(data.killed){ // array of monsters killed by the player since last packet
        for(var i = 0; i < data.killed.length; i++){
            var killed = Game.monstersInfo[Game.monstersIDmap[data.killed[i]]].name;
            Game.messageIn('You killed a '+killed+'!');
            Game.handleKillAchievement(data.killed[i]);
        }
    }
    if(data.used){ // array of items used by the player since last packet
        for(var i = 0; i < data.used.length; i++){
            var used = Game.itemsInfo[Game.itemsIDmap[data.used[i]]];
            if(used.msg) Game.messageIn(used.msg);
            if(!Game.weaponAchievement || !Game.armorAchievement) Game.handleLootAchievement(data.used[i]);
        }
    }
    if(data.noPick){ // boolean indicating whether the player tried to pick an inferior item
        Game.messageIn('You already have better equipment!');
        Game.sounds.play('noloot');
    }
};

Game.revivePlayer = function(){ // Revive the player after clicking "revive"
    Client.sendRevive();
    Game.deathScroll.hideTween.start();
};

// INIT CODE

Game.setLatency = function(latency){
    Game.latency = latency;
};

Game.initWorld = function(data){ // Initialize the game world based on the server data
    AOIutils.nbAOIhorizontal = data.nbAOIhorizontal;
    AOIutils.lastAOIid = data.lastAOIid;

    Game.displayHero(data.player.x,data.player.y,data.player.id);

    Game.displayHUD(); // Displays HUD, and sets up life bar, chat bar, the HUD buttons and their behavior

    Game.setUpPlayer(Game.player,data.player);
    Game.updatePlayerStatus(Game.player,data.player);

    // Reorder the groups a little, so that all their elements render in the proper order
    Game.moveGroupTo(game.world, Game.groundMapLayers, 0);
    Game.moveGroupTo(game.world, Game.scenery, Game.groundMapLayers.z);
    Game.moveGroupTo(game.world, Game.markerGroup, Game.scenery.z); // z start at 1
    Game.moveGroupTo(game.world, Game.entities, Game.markerGroup.z);
    Game.moveGroupTo(game.world, Game.highMapLayers, Game.entities.z);
    Game.moveGroupTo(game.world, Game.HUD, Game.highMapLayers.z);

    Game.itemsTable = {};
    Game.monstersTable = {};
    Game.displayedPlayers = new Set();
    Game.playerIsInitialized = true;
    // If the game loads while the window is out of focus, it may hang; disableVisibilityChange should be set to true
    // only once it's fully loaded
    if(document.hasFocus()){
        game.stage.disableVisibilityChange = true; // Stay alive even if window loses focus
    }else{
        game.onResume.addOnce(function(){
            game.stage.disableVisibilityChange = true;
        }, this);
    }
    // Check whether these three achievements have been fulfilled already (stored in localStorage)
    Game.weaponAchievement = Client.hasAchievement(0);
    Game.armorAchievement = Client.hasAchievement(4);
    Game.speakAchievement = Client.hasAchievement(3);

    Client.emptyQueue(); // Process the queue of packets from the server that had to wait while the client was initializing
    Game.groundMapLayers.setAll('visible',true);
    Game.highMapLayers.setAll('visible',true);
    //Game.scenery.setAll('visible',true);
    // Destroy loading screen
    Game.loadingShade.destroy();
    Game.loadingText.destroy();
    Game.messageIn((Game.isNewPlayer ? 'Welcome to PhaserQuest!' : 'Welcome back!' ));

    if(Game.isNewPlayer) Game.toggleHelp();
};

Game.moveGroupTo = function(parent,group,endPos){
    // parent is the Phaser Group that contains the group to move (default: world)
    // group is the Phaser Group to be moved
    // endPos is the position (integer) at which to move it
    // if endPos is some group's z value, the moved group will be right below (visually) that group
    // This manipulation is needed because the rendering order and visual overlap of the sprites depend of the order of their groups
    var startPos = group.z-1;
    var diff = startPos-endPos;
    if(diff > 0){
        for(diff; diff > 0; diff--){
            parent.moveDown(group);
        }
    }else if(diff < 0){
        for(diff; diff < 0; diff++){
            parent.moveUp(group);
        }
    }
};

Game.displayHero = function(x,y,id){
    Game.player = Game.newPlayer(x,y,id);
    Game.player.setIsPlayer(true);
    Game.player.addChild(Game.cameraFocus = game.add.sprite(0, 16)); // trick to force camera offset
    Game.followPlayer();
};

// MOVE CODE

Game.moveCharacter = function(id,end,orientation,delta){ // Move character according to information from the server
    // end is a small object containing the x and y coordinates to move to
    // orientation, between 1 and 4, indicates the orientation the character should face at the end of the movement
    // delta is the latency of the player, to adjust the speed of the movements (movements go faster as the latency increase, to make sure they don't get increasingly out of sync)
    var character = Game.charactersPool[id];
    character.prepareMovement(end,orientation,{action:0},delta+Game.latency,false); // false : don't send path to server
};
Game.moveMonster = function(id,path,delta){ // Move monster according to information from the server
    // path is an array of 2-tuples of coordinates, representing the path to follow
    // delta is the latency of the player, to adjust the speed of the movements (movements go faster as the latency increase, to make sure they don't get increasingly out of sync)
    var monster = Game.monstersTable[id];
    if(monster) monster.prepareMovement(path, {action: 0}, delta+Game.latency);
};

// REMOVAL CODE

Game.removePlayer = function(player,animate){
    // animate is a boolean to indicate if the death animation should be played or not (if the player to be removed is not visible on screen, it's useless to play the animation)
    if(!player) return;
    player.die(animate);
    delete Game.charactersPool[player.id];
};

// ======================

// SCREENS CODE : Code about displaying screens of any kind

Game.makeAchievementsScroll = function(){ // Create the screen displaying the achievements of the player
    var achievements = Game.db.achievements;
    Game.nbAchievements = Object.keys(achievements).length;
    var perPage = 4;
    Game.currentAchievementsPage = 1;
    Game.minAchievementsPage = 1;
    Game.maxAchievementsPage = Game.nbAchievements/perPage;
    Game.achievementsBg = Game.makeFlatScroll(Game.toggleAchievements);
    var nameStyle = { // Style for achievements names
        font: '18px pixel',
        fill: "#ffffff", // f4d442
        stroke: "#000000",
        strokeThickness: 3
    };
    var descStyle = { // Style for achievements descriptions
        font: '18px pixel',
        fill: "#000000"
    };
    // Creates a mask outside of which the achievement holders won't be visible, to allow to make them slide in and out
    // of the scroll background
    var mask = game.add.graphics(0, 0);
    mask.fixedToCamera = true;
    mask.beginFill(0xffffff);
    mask.drawRect(Game.achievementsBg.x+40, Game.achievementsBg.y+40, Game.achievementsHolderWidth-100,300);
    mask.endFill();
    var page = 0;
    // Create one "holder" per achievement, consisting in a background image, the name and the description
    Game.achievementsBg.holders = [];
    for(var i = 0; i < Game.nbAchievements; i++){
        if(i > 0 && i%perPage == 0) page++;
        Game.achievementsBg.holders.push(Game.achievementsBg.addChild(game.add.sprite(40+(page*Game.achievementsHolderWidth),50+((i%4)*62),'atlas1','achievementholder')));
        Game.achievementsBg.holders[i].addChild(game.add.text(75, 13, achievements[i].name, nameStyle));
        Game.achievementsBg.holders[i].addChild(game.add.text(295, 15, achievements[i].desc,descStyle));
        Game.achievementsBg.holders[i].mask = mask;
    }

    Game.achievementsBg.leftArrow = Game.achievementsBg.addChild(game.add.button(345, 315, 'atlas1',function(){
        Game.changeAchievementsPage('left');
    }, this, 'arrows_2', 'arrows_2', 'arrows_4'));
    Game.achievementsBg.rightArrow = Game.achievementsBg.addChild(game.add.button(412, 315, 'atlas1',function(){
        Game.changeAchievementsPage('right');
    }, this, 'arrows_3', 'arrows_3', 'arrows_5'));
    Game.achievementsBg.leftArrow.input.useHandCursor = false;
    Game.achievementsBg.rightArrow.input.useHandCursor = false;

    Game.achievementsBg.completed = Game.achievementsBg.addChild(game.add.text(645, 325, '', {
        font: '18px pixel',
        fill: "#ffffff",
        stroke: "#000000",
        strokeThickness: 3
    }));
    Game.updateAchievements();
    Game.updateAchievementsArrows();
};

Game.makeDeathScroll = function(){ // Make the screen that is displayed when player dies
    Game.deathScroll = Home.makeScroll(); // Start from a generic scroll-like screen
    Home.setFadeTweens(Game.deathScroll);
    var title = Game.deathScroll.addChild(game.add.text(0, 125, 'You died...',{
        font: '30px pixel',
        fill: "#ffffff",
        stroke: "#000000",
        strokeThickness: 3
    }));
    title.x = Game.deathScroll.width/2 - title.width/2;
    var button = Game.deathScroll.addChild(game.add.button(0,210, 'atlas1',Game.revivePlayer, this, 'revive_0', 'revive_0', 'revive_1'));
    button.x = Game.deathScroll.width/2;
    button.anchor.set(0.5,0);
};

Game.makeFlatScroll = function(callback){ // Creates and empty, generic flat scroll screen, to be used for achievements and help
    // callback is the function to call when clicking on the close button (typically a toggle function, such as toggleHelp() )
    var scroll = game.add.sprite(80,32,'atlas1','achievements');
    scroll.fixedToCamera = true;
    scroll.alpha = 0;
    scroll.visible = false;
    Home.setFadeTweens(scroll);
    var closeBtn = scroll.addChild(game.add.button(scroll.width-18, -14, 'atlas1',callback, this, 'close_1', 'close_0', 'close_2'));
    closeBtn.input.useHandCursor = false;
    return scroll;
};

Game.makeHelpScroll = function(){ // Make the screen showing how to play instructions
    Game.helpScroll = Game.makeFlatScroll(Game.toggleHelp);
    Home.makeTitle(Game.helpScroll,'How to play');
    var mouseY = 130;
    var enterY = 200;
    var charY = 270;
    var style = {font: '18px pixel'};
    var mouse = Game.helpScroll.addChild(game.add.sprite(55,mouseY,'atlas1','mouse'));
    mouse.anchor.set(0.5);
    Game.helpScroll.addChild(game.add.text(100,mouseY-10,Game.db.texts.help_move,style));
    var enter = Game.helpScroll.addChild(game.add.sprite(55,enterY,'atlas1','enter'));
    enter.anchor.set(0.5);
    Game.helpScroll.addChild(game.add.text(100,enterY-12,Game.db.texts.help_chat,style));
    var char = Game.helpScroll.addChild(game.add.sprite(55,charY,'atlas3','clotharmor_31'));
    char.anchor.set(0.5);
    Game.helpScroll.addChild(game.add.text(100,charY-10,Game.db.texts.help_save,style));
};

// Create the screen used to prompt the player to change the orientation of his device
Game.makeOrientationScreen = function(){
    Game.orientationContainer = game.add.sprite(0,0); // Create a container sprite
    // Make black screen to cover the scene
    Game.orientationShade = Game.orientationContainer.addChild(game.add.graphics(0, 0));
    Game.orientationShade.beginFill(0x000000,1);
    Game.orientationShade.drawRect(0,0,game.width,game.height);
    Game.orientationShade.endFill();
    Game.deviceImage = Game.orientationContainer.addChild(game.add.sprite(game.width/2,game.height/2,'atlas1','device'));
    Game.deviceImage.anchor.set(0.5);
    Game.rotateText = Game.orientationContainer.addChild(game.add.text(0, 0, Game.db.texts.orient,{
        font: '40px pixel',
        fill: "#ffffff",
        stroke: "#000000",
        strokeThickness: 3
    }));
    Game.rotateText.x = game.width/2 - Game.rotateText.width/2;
    Game.rotateText.y = Game.deviceImage.y + Game.deviceImage.height + 20;
    Game.rotateText.style.wordWrap = true;
    Game.rotateText.style.wordWrapWidth = 400;
    Game.orientationContainer.fixedToCamera = true;
    Game.orientationContainer.visible = false;
};

Game.displayDeathScroll = function(){ // Displayed when player dies
    if(!Game.deathScroll) Game.makeDeathScroll();
    Game.deathScroll.visible = true;
    Game.deathScroll.showTween.start();
};

// Display an error message if the user id in localStorage has no match in the database;
// called when receiving the error notification from the server
Game.displayError = function(){
    Game.loadingText.text = Game.db.texts.db_error;
    Game.loadingText.x = game.width/2 - Game.loadingText.width/2;
    Game.loadingText.y = game.height/2 - Game.loadingText.height/2;
};

// Display the loading screen when the game starts, after clicking "play"
Game.displayLoadingScreen = function(){
    // Cover the screen with a black rectangle
    Game.loadingShade = game.add.graphics(0, 0);
    Game.loadingShade.beginFill(0x000000,1);
    Game.loadingShade.drawRect(Game.borderPadding,Game.borderPadding,game.stage.width-(Game.borderPadding*2),game.stage.height-(Game.borderPadding*2));
    Game.loadingShade.endFill();
    // Add some loading text (whos value is in Game.db.texts) and center it
    Game.loadingText = game.add.text(0, 0, Game.db.texts.create,{
        font: '18px pixel',
        fill: "#ffffff", // f4d442
        stroke: "#000000",
        strokeThickness: 3
    });
    Game.loadingText.x = game.width/2 - Game.loadingText.width/2;
    Game.loadingText.y = game.height/2 - Game.loadingText.height/2;
    Game.loadingText.style.wordWrap = true;
    Game.loadingText.style.wordWrapWidth = 400;
};

// Displays the screen used to prompt the player to change the orientation of his device;
// called by the enterIncorrectOrientation callback
Game.displayOrientationScreen = function(){
    if(!Game.orientationContainer) Game.makeOrientationScreen(); // Make the screen if it doesn't exist yet (it's not made until necessary)
    // Hide the help and achievements screens if they are visible
    if(Game.helpScroll && Game.helpScroll.visible) Game.toggleHelp();
    if(Game.achievementsBg && Game.achievementsBg.visible) Game.toggleAchievements();
    Game.orientationContainer.visible = true;
};

// Hide the screen used to prompt the player to change the orientation of his device;
// called by the leaveIncorrectOrientation callback
Game.removeOrientationScreen = function(){
    Game.orientationContainer.visible = false;
};

Game.toggleHelp = function(){ // Toggles the visibility state of the help screen
    if(!Game.helpScroll) Game.makeHelpScroll();
    if(Game.helpScroll.visible){
        Game.helpButton.freezeFrames = false;
        Game.helpButton.setFrames('helpicon_1','helpicon_0','helpicon_2');
        Game.helpScroll.hideTween.start();
    }else{
        Game.helpScroll.visible = true;
        Game.helpButton.freezeFrames = true;
        Game.helpScroll.showTween.start();
    }
};

Game.toggleAchievements = function(){ // Toggles the visibility state of the achievements screen
    if(!Game.achievementsBg) Game.makeAchievementsScroll();
    if(Game.achievementsBg.visible){
        Game.achButton.freezeFrames = false;
        Game.achButton.setFrames('achievementicon_1','achievementicon_0','achievementicon_2');
        Game.achievementsBg.hideTween.start();
    }else{
        Game.achButton.freezeFrames = true;
        Game.achievementsBg.visible = true;
        Game.achievementsBg.showTween.start();
        if(Game.achTween.isRunning) Game.achTween.pause(); // Stops the blinking achievement icon tween
    }
};

Game.updateAchievements = function(){
    // Check each achievement holder and, if the corresponding achievement has been acquired, update the content accordingly
    if(!Game.achievementsBg) Game.makeAchievementsScroll();
    var achievements = Game.db.achievements;
    var completed = 0;
    for(var i = 0; i < Game.nbAchievements; i++){
        var owned = Client.hasAchievement(i);
        if(owned) completed++;
        if(owned) {
            Game.achievementsBg.holders[i].addChild(game.add.sprite(0, 0, 'atlas1','tokens_'+achievements[i].token));
            Game.achievementsBg.holders[i].getChildAt(0).addColor("#f4d442",0);
        }
    }
    Game.achievementsBg.completed.text = 'Completed '+completed+'/'+Game.nbAchievements;
};

Game.changeAchievementsPage = function(dir){
    // dir is a string that indicates if the right or left arrow was clicked
    if(dir == 'right' && Game.currentAchievementsPage == Game.maxAchievementsPage) return;
    if(dir == 'left' && Game.currentAchievementsPage == Game.minAchievementsPage) return;
    var sign = (dir == 'right' ? -1 : 1);
    for(var i = 0; i < Game.achievementsBg.holders.length; i++){
        var holder = Game.achievementsBg.holders[i];
        var tween = game.add.tween(holder);
        tween.to({x: holder.x+(sign*Game.achievementsHolderWidth)}, Phaser.Timer.SECOND*0.4);
        tween.start();
    }
    Game.currentAchievementsPage += -1*sign;
    Game.updateAchievementsArrows();
};

Game.updateAchievementsArrows = function(){
    if(Game.currentAchievementsPage == Game.maxAchievementsPage){
        Game.achievementsBg.rightArrow.setFrames('arrows_1','arrows_1','arrows_1');
    }else{
        Game.achievementsBg.rightArrow.setFrames('arrows_3','arrows_3','arrows_5');
    }
    if(Game.currentAchievementsPage == Game.minAchievementsPage){
        Game.achievementsBg.leftArrow.setFrames('arrows_0','arrows_0','arrows_0');
    }else{
        Game.achievementsBg.leftArrow.setFrames('arrows_2','arrows_2','arrows_4');
    }
};

// ==============

// ACHIEVEMENTS CODE : Code about handling achievements

Game.handleLootAchievement = function(id){ // item id
    var item = Game.itemsInfo[Game.itemsIDmap[id]];
    if(item.type !== undefined){
        if(item.type == 1 && !Game.weaponAchievement){
            Game.getAchievement(0);
            Game.weaponAchievement = true;
        }else if(item.type == 2 && !Game.armorAchievement){
            Game.getAchievement(4);
            Game.armorAchievement = true;
        }
    }
};

Game.handleSpeakAchievement = function() {
    Game.getAchievement(3);
    Game.speakAchievement = true;
};

Game.handleKillAchievement = function(id){ // monster id
    var nbKilled =  localStorage.getItem('killed_'+id);
    if(nbKilled === undefined) nbKilled = 0;
    nbKilled++;
    localStorage.setItem('killed_'+id,nbKilled);
    var aid = Game.monstersInfo[Game.monstersIDmap[id]].achievement;
    if(Game.db.achievements[aid] && nbKilled >= Game.db.achievements[aid].nb && !Client.hasAchievement(aid)) Game.getAchievement(aid);
};

Game.handleLocationAchievements = function(){
    if(Game.inDoor || !Game.locationAchievements.length) return;
    var pos = Game.computeTileCoords(Game.player.x,Game.player.y);
    for(var i = Game.locationAchievements.length-1; i >= 0 ; i--){
        var area = Game.locationAchievements[i];
        if((area.criterion == "in" && area.contains(pos.x,pos.y)) || (area.criterion == "out" && !area.contains(pos.x,pos.y))){
            Game.getAchievement(area.achID);
            Game.locationAchievements.splice(i,1);
        }
    }
};

Game.getAchievement = function(id){ // achievement id
    Client.setAchievement(id);
    Game.sounds.play('achievement');
    Game.achButton.blink = false;
    if(!Game.achTween.isRunning) Game.achTween.start();
    if(Game.achTween.isPaused) Game.achTween.resume();
    Game.achBar.visible = true;
    Game.achBar.upTween.start();
    Game.achBar.achName.text = Game.db.achievements[id].name;
    Game.achBar.achName.x = Math.floor((Game.achBar.width/2) - (Game.achBar.achName.width/2));
    Game.updateAchievements();
};

Game.findLocationAchievements = function(){
    Game.locationAchievements = [];
    Object.keys(Game.db.achievements).forEach(function(achID){
        if(Client.hasAchievement(achID)) return;
        var ach = Game.db.achievements[achID];
        if(ach.locationAchievement) {
            var area = new Phaser.Rectangle(ach.rect.x,ach.rect.y,ach.rect.w,ach.rect.h);
            area.criterion = ach.criterion;
            area.achID = achID;
            Game.locationAchievements.push(area);
        }
    });
};

// =======================
// POS CODE : Code for position and camera-related computations

// Determines if two entities (a and b) are on the same cell (returns -1), on adjacent (non-diagonal) cells (returns a value between
// 1 and 4 corresponding to the orientation of a with respect to b) or further apart (returns 0)
Game.adjacent = function(a,b){
    if(!a || !b) return 0;
    var posA = Game.computeTileCoords(a.x, a.y);
    var posB = Game.computeTileCoords(b.x, b.y);
    var Xdiff = posA.x-posB.x;
    var Ydiff = posA.y-posB.y;
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

// Fetches the first element from the space map at the proived coordinates
Game.detectElement = function(map,x,y){
    // map is the spaceMap in which to look
    var cell = Game.computeTileCoords(x,y);
    return map.getFirst(cell.x,cell.y);
};

// Compute the orientation that the player must have to go to the last cell of its path (used when the last cell is occupied by something and the past has to be "shortened" by one cell)
Game.computeFinalOrientation = function(path){ // path is a list of cells
    // path is an array of 2-tuples of coordinates
    var last = path[path.length-1];
    var beforeLast =  path[path.length-2];
    if(last.x < beforeLast.x){
        return 1;
    }else if(last.y < beforeLast.y){
        return 2;
    }else if(last.x > beforeLast.x){
        return 3;
    }else if(last.y > beforeLast.y){
        return 4;
    }
};

// Convert pixel coordinates into tiles coordinates (e.g. 96, 32 becomes 3, 1)
Game.computeTileCoords = function(x,y){
    var layer = Game.map.gameLayers[0];
    return new Phaser.Point(layer.getTileX(x),layer.getTileY(y));
};

// Returns the rectangle corresponding to the view of the camera (not counting HUD, the actual view of the world)
Game.computeView = function(){
    Game.view = new Phaser.Rectangle(game.camera.x + Game.borderPadding, game.camera.y + Game.borderPadding,
        game.camera.width - Game.borderPadding*2, game.camera.height - Game.borderPadding*2 - Game.HUDheight);
};

Game.checkCameraBounds = function(){
    // Due to the shape of the map, the bounds of the camera cannot always be the same; north of some Y coordinate (Game.mapWideningY),
    // the width of the bounds has to increase, from 92 to 113.
    var pos = Game.computeTileCoords(Game.player.x,Game.player.y);
    if(Game.cameraFollowing && pos.y <= Game.mapWideningY && game.camera.bounds.width == 92*Game.map.tileWidth){
        Game.tweenCameraBounds(113);
    }else if(Game.cameraFollowing && pos.y > Game.mapWideningY && game.camera.bounds.width == 113*Game.map.tileWidth){
        Game.tweenCameraBounds(92);
    }
};

Game.tweenCameraBounds = function(width){
    // width is the width in pixels of the camera bounds that should be tweened to
    var tween = game.add.tween(Game.camera.bounds);
    tween.to({width: width*Game.map.tileWidth}, 1500,null, false, 0);
    tween.start();
};

Game.followPlayer = function(){ // Make the camera follow the player, within the appropriate bounds
    Game.inDoor = false;
    // Rectangle to which the camera is bound, cannot move outside it
    var width = (Game.player.x >= 92 ? 113 : 92);
    game.camera.bounds = new Phaser.Rectangle(Game.map.tileWidth-Game.borderPadding,Game.map.tileWidth-Game.borderPadding,width*Game.map.tileWidth,311*Game.map.tileWidth);
    game.camera.follow(Game.cameraFocus);
    Game.cameraFollowing = true;
};

Game.followPlayerIndoors = function(x,y,mx,my){ // Follow player but with extra constraints due to being indoors
    // x and y are the coordinates in tiles of the top left corner of the rectangle in which the camera can move
    // mx and my are the coordinates in tiles of the bottom right corner of that same rectangle
    Game.inDoor = true;
    game.camera.follow(Game.cameraFocus);
    if(x && y && mx && my) {
        var w = Math.max((mx - x)*Game.map.tileWidth,game.width);
        var h = (my - y)*Game.map.tileHeight;
        game.camera.bounds = new Phaser.Rectangle(x*Game.map.tileWidth,y*Game.map.tileHeight,w,h);
    }else{
        game.camera.bounds = new Phaser.Rectangle(Game.map.tileWidth - Game.borderPadding, Game.map.tileWidth - Game.borderPadding, 170 * Game.map.tileWidth, 311 * Game.map.tileWidth);
    }
    Game.cameraFollowing = true;
};

Game.unfollowPlayer = function(){ // Make the camera stop following player, typically because he is in a small indoors area
    Game.inDoor = true;
    game.camera.unfollow();
    game.camera.bounds = null;
    Game.cameraFollowing = false;
};

// =============
// Sounds-related code

Game.addSounds = function(){
    // Slices the audio sprite based on the markers positions fetched from the JSON
    var markers = Game.db.sounds;
    Game.sounds = game.add.audio('sounds');
    Game.sounds.allowMultiple = true;
    Object.keys(markers.spritemap).forEach(function(sound){
        var sfx = markers.spritemap[sound];
        Game.sounds.addMarker(sound, sfx.start, sfx.end-sfx.start);
    });
};

//===================
// Animations-related code

// Sets up basic, single-orientation animations for scenic animated sprites
Game.basicAnimation = function(sprite){ // sprite is the sprite to which the animation should be applied
    var frames = [];
    for(var m = 0; m < sprite.nbFrames; m++){ // Generate the list of frames of the animations based on the initial frame and the total number of frames
        frames.push(sprite.frame+m);
    }
    sprite.animations.add('idle', frames, sprite.rate, true);
    sprite.animations.play('idle');
};

// Same but using atlas frames
Game.basicAtlasAnimation = function(sprite){ // sprite is the sprite to which the animation should be applied
    // sprite, nbFrames, ... are absorbed from npc.json when a new NPC() is created
    sprite.animations.add('idle', Phaser.Animation.generateFrameNames(sprite.atlasKey+'_', 0, 0+sprite.nbFrames-1), sprite.rate, true);
    sprite.animations.play('idle');
};

//======================
// HUD CODE: HUD-related code

Game.displayHUD = function() {
    var lifeX = Game.borderPadding;
    var lifeY = game.height - Game.borderPadding - Game.HUDheight + 6;
    Game.barY = game.height - Game.borderPadding - Game.HUDheight;

    Game.HUDbuttons = game.add.group();

    Game.displayChatBar();
    Game.displayAchievementDock();

    Game.HUD.add(game.add.sprite(Game.borderPadding, Game.barY, 'atlas1','bar'));
    Game.HUD.add(Game.weaponIcon = game.add.sprite(Game.borderPadding + 210, Game.barY, 'atlas3'));
    Game.HUD.add(Game.armorIcon = game.add.sprite(Game.borderPadding + 244, Game.barY + 3,'atlas3'));

    Game.HUDmessage = null;
    Game.messages = game.add.group();
    for(var m = 0; m < 4; m++){
        Game.messages.add(game.add.text(490, Game.barY+5, '', {
            font: '16px pixel',
            fill: "#eeeeee"
        }));
    }
    Game.messages.setAll('fixedToCamera', true);
    Game.messages.setAll("anchor.x",0.5);
    Game.messages.setAll("exists",false);

    Game.nbConnectedText = Game.HUD.add(game.add.text(745, Game.barY+8, '0 players', {
        font: '16px pixel',
        fill: "#eeeeee"
    }));

    Game.chatButton = Game.HUDbuttons.add(game.add.button(850, Game.barY + 2, 'atlas1', Game.toggleChat, this, 'talkicon_1', 'talkicon_0', 'talkicon_2'));
    Game.achButton = Game.HUDbuttons.add(game.add.button(880, Game.barY + 2, 'atlas1',Game.toggleAchievements, this, 'achievementicon_1', 'achievementicon_0', 'achievementicon_2'));
    Game.helpButton = Game.HUDbuttons.add(game.add.button(910, Game.barY + 2, 'atlas1', Game.toggleHelp, this, 'helpicon_1', 'helpicon_0', 'helpicon_2'));
    Game.HUDbuttons.add(game.add.button(940, Game.barY + 2, 'atlas1', function (_btn) {
        if(!game.sound.mute){
            _btn.setFrames('soundicon_1','soundicon_0','soundicon_1');
        }else if(game.sound.mute){
            _btn.setFrames('soundicon_2','soundicon_2','soundicon_2');
        }
        game.sound.mute = !game.sound.mute;
    }, this, 'soundicon_2', 'soundicon_2','soundicon_2'));

    // Set up the blinking tween that triggers when a new achievement is unlocked
    Game.achTween = game.add.tween(Game.achButton);
    // will blink every 500ms
    Game.achTween.to({},500,null, false, 0,-1); // -1 to loop forever
    Game.achTween.onLoop.add(function(btn){
        btn.blink = !btn.blink;
        if(btn.blink){
            Game.achButton.setFrames('achievementicon_3','achievementicon_3','achievementicon_3');
        }else{
            Game.achButton.setFrames('achievementicon_1','achievementicon_0','achievementicon_2');
        }
    }, this);

    Game.createLifeBar(lifeX, lifeY);
    Game.HUD.add(Game.health);
    Game.HUD.add(game.add.sprite(lifeX, lifeY, 'atlas1','life'));
    Game.HUD.add(Game.HUDbuttons);
    Game.HUD.setAll('fixedToCamera', true);
    Game.HUDbuttons.forEach(function (button) {
        button.input.useHandCursor = false;
    });

    var chatKey = game.input.keyboard.addKey(Phaser.Keyboard.ENTER);
    chatKey.onDown.add(Game.toggleChat, this);
};

Game.displayChatBar = function(){
    Game.chatBar = Game.HUD.add(game.add.sprite(96, Game.barY+1, 'atlas1', 'chatbar'));
    Game.chatBar.visible = false;
    Game.chatBar.upTween = game.add.tween(Game.chatBar.cameraOffset);
    Game.chatBar.downTween = game.add.tween(Game.chatBar.cameraOffset);
    Game.chatBar.upTween.to({y: Game.barY-30}, Phaser.Timer.SECOND/5);
    Game.chatBar.downTween.to({y: Game.barY+1}, Phaser.Timer.SECOND/5);
    Game.chatBar.downTween.onComplete.add(function(){
        Game.chatBar.visible = false;
    },this);
    Game.chatBar.upTween.onComplete.add(function(){
        Game.chatInput.focusOutOnEnter = true;
    },this);
    Game.chatInput = Game.HUD.add(game.add.inputField(115, Game.barY-20,{
        width: 750,
        height: 18,
        fillAlpha: 0,
        cursorColor: '#fff',
        fill: '#fff',
        font: '14px pixel',
        max: Game.maxChatLength
    }));
    Game.chatInput.visible = false;
    Game.chatInput.focusOutOnEnter = false;
    Game.chatInput.input.useHandCursor = false;
};

Game.displayAchievementDock = function(){
    Game.achBar = Game.HUD.add(game.add.sprite(274, Game.barY+1, 'atlas1', 'newach'));
    Game.achBar.visible = false;
    Game.achBar.upTween = game.add.tween(Game.achBar.cameraOffset);
    Game.achBar.downTween = game.add.tween(Game.achBar.cameraOffset);
    Game.achBar.upTween.to({y: Game.barY-68}, Phaser.Timer.SECOND/5);
    Game.achBar.downTween.to({y: Game.barY+1}, Phaser.Timer.SECOND/5,null,false,Phaser.Timer.SECOND*5);
    Game.achBar.downTween.onComplete.add(function(){
        Game.achBar.visible = false;
    },this);
    Game.achBar.upTween.onComplete.add(function(){
        Game.achBar.downTween.start();
    },this);
    Game.achBar.addChild(game.add.sprite(192, -35, 'atlas1', 'tokens_0'));
    var sparks = Game.achBar.addChild(game.add.sprite(192,-35, 'atlas1','achsparks_0'));
    var frames = Phaser.Animation.generateFrameNames('achsparks_', 0, 5);
    sparks.animations.add('glitter', frames, 7, true);
    sparks.play('glitter');
    var titleStyle = {
        font: '14px pixel',
        fill: "#f4d442",
        stroke: "#000000",
        strokeThickness: 3
    };
    var nameStyle = {
        font: '16px pixel',
        fill: "#ffffff", // f4d442
        stroke: "#000000",
        strokeThickness: 3
    };
    Game.achBar.addChild(game.add.text(133, 20, 'New Achievement Unlocked!',titleStyle));
    Game.achBar.achName = Game.achBar.addChild(game.add.text(133, 40, 'A true Warrior!',nameStyle));
};

Game.computeLifeBarWidth = function(){
    // Based on the amount of life the player has, compute how many pixels wide the health bar should be
    return Math.max(Game.healthBarWidth*(Game.player.life/Game.player.maxLife),1);
};

Game.createLifeBar = function(lifeX,lifeY){
    // lifeX and lifeY are the coordinates in pixels where the life bar should be displayed at on the screen
    var width = Game.computeLifeBarWidth();
    Game.health = game.add.sprite(lifeX+20,lifeY+4);
    Game.health.addChild(game.add.tileSprite(0,0, width, 18,'life',0));
    Game.health.addChild(game.add.sprite(width,0,'life',1));
};

Game.createMarker = function(){ // Creates the white marker that follows the pointer
    Game.markerGroup = game.add.group();
    Game.marker = Game.markerGroup.add(game.add.sprite(0,0, 'atlas1'));
    Game.marker.alpha = 0.5;
    Game.marker.canSee = true;
    Game.marker.collide = false;
    game.canvas.style.cursor = Game.cursor;
};

Game.updateMarker = function(x,y,collide) { // Makes the marker white or red depending on whether the underlying tile is collidable
    // collide is the boolean indicating if the tile is a collision tile or not
    Game.marker.position.set(x,y);
    Game.marker.frameName = (collide ? 'marker_1' : 'marker_0');
    Game.marker.collide = collide;
};

Game.messageIn = function(txt){ // Slide a message in the message area of the HUD
    // txt is the string to display in the message area
    var msg = Game.messages.getFirstExists(false);
    msg.exists = true;
    msg.alpha = 0;
    msg.text = txt;
    msg.cameraOffset.y = Game.barY+20;
    var yTween = game.add.tween(msg.cameraOffset);
    var alphaTween = game.add.tween(msg);
    yTween.to({y: Game.barY+8}, Phaser.Timer.SECOND/5);
    alphaTween.to({alpha: 1}, Phaser.Timer.SECOND/5);
    yTween.start();
    alphaTween.start();
    if(Game.HUDmessage) Game.messageOut(Game.HUDmessage);
    Game.HUDmessage = msg;
    var outTween = game.add.tween(msg);
    outTween.to({}, Phaser.Timer.SECOND*3);
    outTween.onComplete.add(Game.messageOut,this);
    outTween.start();
};

Game.messageOut = function(msg){ // Slide a message in the message area of the HUD
    // msg is the text object to move out
    var yTween = game.add.tween(msg.cameraOffset);
    var alphaTween = game.add.tween(msg);
    yTween.to({y: Game.barY}, Phaser.Timer.SECOND/5);
    alphaTween.to({alpha: 0}, Phaser.Timer.SECOND/5);
    yTween.start();
    alphaTween.start();
    alphaTween.onComplete.add(function(txt){
        txt.exists = false;
    },this);
    Game.HUDmessage = null;
};

Game.toggleChat = function(){ // Toggles the visibility of the chat bar
    if(Game.chatBar.visible){ // Hide bar
        Game.chatButton.frameName = 'talkicon_0';
        Game.chatButton.freezeFrames = false;
        Game.chatInput.focusOutOnEnter = false;
        Game.chatInput.visible = false;
        Game.chatInput.endFocus();
        Game.chatBar.downTween.start();
        if (Game.chatInput.text.text) { // If a text has been typed, send it
            var txt = Game.chatInput.text.text;
            Game.player.displayBubble(txt);
            Client.sendChat(txt);
        }
        Game.chatInput.resetText();
    }else{ // Show bar
        Game.chatButton.frameName = 'talkicon_2';
        Game.chatButton.freezeFrames = true;
        Game.chatBar.visible = true;
        Game.chatInput.visible = true;
        Game.chatInput.startFocus();
        Game.chatBar.upTween.start();
    }
};

Game.updateNbConnected = function(nb){
    if(!Game.nbConnectedText) return;
    Game.nbConnected = nb;
    Game.nbConnectedText.text = Game.nbConnected+' player'+(Game.nbConnected > 1 ? 's' : '');
};

// ===========================
// MAP CODE : Map & NPC-related code

Game.displayMap = function(){
    Game.groundMapLayers = game.add.group();
    Game.highMapLayers = game.add.group();
    Game.map = game.add.tilemap('map');
    Game.map.addTilesetImage('tilesheet', 'tileset');
    Game.map.gameLayers = [];
    for(var i = 0; i < Game.map.layers.length; i++) {
        var group = (i <= Game.nbGroundLayers-1 ? Game.groundMapLayers : Game.highMapLayers);
        Game.map.gameLayers[i] = Game.map.createLayer(Game.map.layers[i].name,0,0,group);
        Game.map.gameLayers[i].visible = false; // Make map invisible before the game has fully loaded
    }
    Game.map.gameLayers[0].inputEnabled = true; // Allows clicking on the map
    Game.map.gameLayers[0].events.onInputUp.add(Game.handleMapClick, this);
    Game.createDoorsMap(); // Create the associative array mapping coordinates to doors/teleports

    //game.world.resize(Game.map.widthInPixels,Game.map.heightInPixels);
    game.world.setBounds(0,0,Game.map.widthInPixels,Game.map.heightInPixels);

    Game.map.tileset = {
        gid: 1,
        tileProperties: Game.map.tilesets[0].tileProperties
    };

    Game.createCollisionArray();
};

Game.createCollisionArray = function(){
    // Create the grid used for pathfinding ; it consists in a 2D array of 0's and 1's, 1's indicating collisions
    Game.collisionArray = [];
    for(var y = 0; y < Game.map.height; y++){
        var col = [];
        for (var x = 0; x < Game.map.width; x++) {
            var collide = false;
            for (var l = 0; l < Game.map.gameLayers.length; l++) {
                var tile = Game.map.getTile(x, y, Game.map.gameLayers[l]);
                if (tile) {
                    // The original BrowserQuest Tiled file doesn't use a collision layer; rather, properties are added to the
                    // tileset to indicate which tiles causes collisions or not. Which is why we have to check in the tileProperties
                    // if a given tile has the property "c" or not (= collision)
                    var tileProperties = Game.map.tileset.tileProperties[tile.index - Game.map.tileset.gid];
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
        Game.collisionArray.push(col);
    }

    Game.easystar.setGrid(Game.collisionArray);
    Game.easystar.setAcceptableTiles([0]);
};

Game.createDoorsMap = function(){ // Create the associative array mapping coordinates to doors/teleports
    Game.doors = new spaceMap();
    for (var d = 0; d < Game.map.objects.doors.length; d++) {
        var door = Game.map.objects.doors[d];
        var position = Game.computeTileCoords(door.x, door.y);
        Game.doors.add(position.x, position.y, {
            to: new Phaser.Point(door.properties.x * Game.map.tileWidth, door.properties.y * Game.map.tileWidth), // Where does the door teleports to
            camera: (door.properties.hasOwnProperty('cx') ? new Phaser.Point(door.properties.cx * Game.map.tileWidth, door.properties.cy * Game.map.tileWidth): null), // If set, will lock the camera at these coordinates (use for indoors locations)
            orientation: door.properties.o, // What should be the orientation of the player after teleport
            follow: door.properties.hasOwnProperty('follow'), // Should the camera keep following the player, even if indoors (automatically yes if outdoors)
            // Below are the camera bounds in case of indoors following
            min_cx: door.properties.min_cx,
            min_cy: door.properties.min_cy,
            max_cx: door.properties.max_cx,
            max_cy: door.properties.max_cy
        });
    }
};

Game.displayScenery = function(){
    var scenery = Game.db.scenery.scenery;
    Game.groundMapLayers.forEach(function(layer){
        for(var k = 0; k < scenery.length; k++) {
            Game.map.createFromTiles(Game.map.tileset.gid+scenery[k].id, -1, // tile id, replacemet
                'tileset',layer,// key of new sprite, layer
                Game.scenery, // group added to
                {
                    frame: scenery[k].frame,
                    nbFrames: scenery[k].nbFrames,
                    rate: 2
                });
        }
    });
    Game.scenery.setAll('visible',false);
    Game.scenery.forEach(Game.basicAnimation,this);
};

Game.displayNPC = function() {
    var entities = game.cache.getJSON('entities'); // mapping from object IDs to sprites, the sprites being keys for the appropriate json file
    for (var e = 0; e < Game.map.objects.entities.length; e++) {
        var object = Game.map.objects.entities[e];
        if (!entities.hasOwnProperty(object.gid - 1961)) continue; // 1961 is the starting ID of the npc tiles in the map ; this follows from how the map was made in the original BrowserQuest
        var entityInfo = entities[object.gid - 1961];
        if(entityInfo.npc) Game.basicAtlasAnimation(Game.entities.add(new NPC(object.x, object.y, entityInfo.sprite)));
    }
};

// ===========================
// Mouse and click-related code

Game.enableClick = function(){
    this.clickEnabled = true;
};

Game.disableClick = function() {
    this.clickEnabled = false;
};

Game.handleClick = function(){
    // If click is enabled, return true to the calling function to allow player to click,
    // then disable any clicking for time clickDelay
    if (this.clickEnabled){
        // re-enable the click after time clickDelay has passed
        game.time.events.add(this.clickDelay, this.enableClick, this);
        Game.disableClick();
        return true;
    }
    return false;
};

Game.handleCharClick = function(character){ // Handles what happens when clicking on an NPC
    if (Game.handleClick()) {
        // character is the sprite that was clicked
        var end = Game.computeTileCoords(character.x, character.y);
        end.y++; // So that the player walks to place himself in front of the NPC
        // NPC id to keep track of the last line said to the player by each NPC; since there can be multiple identical NPC
        // (e.g. the guards), the NPC ids won't do ; however, since there can be only one NPC at a given location, some
        // basic "hash" of its coordinates makes for a unique id, as follow
        var cid = character.x + '_' + character.y;
        // Game.player.dialoguesMemory keeps track of the last line (out of the multiple an NPC can say) that a given NPC has
        // said to the player; the following finds which one it is, and increment it to display the next one
        var lastline;
        if (Game.player.dialoguesMemory.hasOwnProperty(cid)) {
            // character.dialogue is an array of all the lines that an NPC can say. If the last line said is the last
            // of the array, then assign -1, so that no line will be displayed at the next click (and then it will resume from the first line)
            if (Game.player.dialoguesMemory[cid] >= character.dialogue.length) Game.player.dialoguesMemory[cid] = -1;
        } else {
            // If the player has never talked to the NPC, start at the first line
            Game.player.dialoguesMemory[cid] = 0;
        }
        lastline = Game.player.dialoguesMemory[cid]++; // assigns to lastline, then increment
        var action = {
            action: 1, // talk
            id: cid,
            text: (lastline >= 0 ? character.dialogue[lastline] : ''), // if -1, don't display a bubble
            character: character
        };
        Game.player.prepareMovement(end, 2, action, 0, true); // true : send path to server
    };
};

Game.handleChestClick = function(chest){ // Handles what happens when clicking on a chest
    if (Game.handleClick()) {
        // chest is the sprite that was clicked
        var end = Game.computeTileCoords(chest.x, chest.y);
        var action = {
            action: 4, // chest
            x: end.x,
            y: end.y
        };
        Game.player.prepareMovement(end, 0, action, 0, true); // true : send path to server
    }
};

Game.handleLootClick = function(loot){ // Handles what happens when clicking on an item
    if (Game.handleClick()) {
        // loot is the sprite that was clicked
        Game.player.prepareMovement(Game.computeTileCoords(loot.x, loot.y), 0, {action: 0}, 0, true); // true : send path to server
    }
};

Game.handleMapClick = function(layer,pointer){ // Handles what happens when clicking on an empty tile to move
    if (Game.handleClick()) {
        // layer is the layer object that was clicked on, pointer is the mouse
        if (!Game.marker.collide && Game.view.contains(pointer.worldX, pointer.worldY)) { // To avoid trigger movement to collision cells or cells below the HUD
            var end = Game.computeTileCoords(Game.marker.x, Game.marker.y);
            Game.player.prepareMovement(end, 0, {action: 0}, 0, true); // true : send path to server
        }
    }
};

Game.handleMonsterClick = function(monster){ // Handles what happens when clicking on a monster
    if (Game.handleClick()) {
        // monster is the sprite that was clicked on
        var end = Game.computeTileCoords(monster.x, monster.y);
        var action = {
            action: 3, // fight
            id: monster.id
        };
        Game.player.prepareMovement(end, 0, action, 0, true); // true : send path to server
    }
};

Game.manageMoveTarget = function(x,y){
    // The move target is the green animated square that appears where the player is walking to.
    // This function takes care of displaying it or hiding it.
    var targetX = x * Game.map.tileWidth;
    var targetY = y * Game.map.tileWidth;
    if(Game.moveTarget) {
        Game.moveTarget.visible = true;
        Game.moveTarget.x = targetX;
        Game.moveTarget.y = targetY;
    }else{
        Game.moveTarget = Game.markerGroup.add(game.add.sprite(targetX, targetY, 'atlas1'));
        Game.moveTarget.animations.add('rotate', Phaser.Animation.generateFrameNames('target_', 0, 3), 15, true);
        Game.moveTarget.animations.play('rotate');
    }
    Game.marker.visible = false;
};

Game.setHoverCursors = function(sprite,cursor){ // Sets the appearance of the mouse cursor when hovering a specific sprite
    // sprite is the sprite that to apply the hover to
    // cursor is the url of the image to use as a cursor
    sprite.inputEnabled = true;
    sprite.events.onInputOver.add(function () {
        game.canvas.style.cursor = cursor;
        Game.marker.canSee = false; // Make the white position marker invisible
    }, this);
    sprite.events.onInputOut.add(function () {
        game.canvas.style.cursor = Game.cursor;
        Game.marker.canSee = true;
    }, this);
    sprite.events.onDestroy.add(function(){ // otheriwse, if sprite is destroyed while the cursor is above it, it'll never fire onInputOut!
        game.canvas.style.cursor = Game.cursor;
        Game.marker.canSee = true;
    },this);
};

Game.resetHoverCursors = function(sprite){
    // sprite is the sprite whose hover events have to be purged
    sprite.events.onInputOver.removeAll();
    sprite.events.onInputOut.removeAll();
};

// ===================
// Speech bubbles and HP code (stuff that appears above players)

// dictionary of the fill and stroke colors to use to display different kind of HP
var colorsDict = {
    'heal': {
        fill: "#00ad00",
        stroke: "#005200"
    },
    'hurt':{
        fill: '#ad0000',
        stroke: '#520000'
    },
    'hit':{
        fill: '#ffffff',
        stroke: '#000000'
    }
};

Game.makeHPtexts = function(){ // Create a pool of HP texts to (re)use when needed during the game
    Game.HPGroup = game.add.group();
    for(var b = 0; b < 60; b++){
        Game.HPGroup.add(game.add.text(0, 0, '', {
            font: '20px pixel',
            strokeThickness: 2
        }));
    }
    Game.HPGroup.setAll('exists',false);
};

Game.displayHP = function(txt,color,target,delay){ // Display hit points above a sprite
    // txt is the value to display
    // target is the sprite above which the hp should be displayed
    // delay is the amount of ms to wait before tweening the hp
    var hp = Game.HPGroup.getFirstExists(false); // Get HP from a pool instead of creating a new object
    hp.text = txt;
    hp.fill = colorsDict[color].fill;
    hp.stroke = colorsDict[color].stroke;
    hp.lifespan = Phaser.Timer.SECOND * 2; // Disappears after 2sec
    hp.alpha = 1;
    hp.x = target.x + 10;
    hp.y = target.y-30;
    var tween = game.add.tween(hp);
    tween.to({y:hp.y-25,alpha: 0}, Phaser.Timer.SECOND * 2,null, false, delay);
    tween.start();
    hp.exists = true;
};

Game.playerSays = function(id,txt){
    // Display the chat messages received from the server above the players
    // txt is the string to display in the bubble
    var player = Game.charactersPool[id];
    player.displayBubble(txt);
};

Game.makeBubble = function(){ // Create a speech bubble
    var bubble = game.add.sprite(0,0);
    bubble.addChild(game.add.sprite(0,0, 'bubble',0)); // Top left corner
    bubble.addChild(game.add.tileSprite(Game.speechBubbleCornerSize,0,0,Game.speechBubbleCornerSize, 'bubble',1)); // top side
    bubble.addChild(game.add.sprite(0,0, 'bubble',2)); // top right corner

    bubble.addChild(game.add.tileSprite(0,Game.speechBubbleCornerSize,Game.speechBubbleCornerSize,0, 'bubble',3)); // left side
    bubble.addChild(game.add.tileSprite(Game.speechBubbleCornerSize,Game.speechBubbleCornerSize,0,0, 'bubble',4)); // center
    bubble.addChild(game.add.tileSprite(0,Game.speechBubbleCornerSize,Game.speechBubbleCornerSize,0, 'bubble',5)); // right side

    bubble.addChild(game.add.sprite(0,0, 'bubble',6)); // bottom left corner
    bubble.addChild(game.add.tileSprite(Game.speechBubbleCornerSize,0,0,Game.speechBubbleCornerSize, 'bubble',7)); // bottom side
    bubble.addChild(game.add.sprite(0,0, 'bubble',8)); // bottom right corner
    bubble.addChild(game.add.sprite(0,0, 'atlas1','tail')); // tail
    var txt = bubble.addChild(game.add.text(0,0, '', {
        font: '14px pixel',
        fill: "#ffffff",
        stroke: "#000000",
        strokeThickness: 2
    }));
    txt.maxWidth = 200;
    txt.alpha = 1.5;
    return bubble;
};

// ================================
// Main update code

Game.markerHasMoved = function(){
    return (Game.previousMarkerPosition.x != Game.markerPosition.x || Game.previousMarkerPosition.y != Game.markerPosition.y);
};

Game.sortEntities = function(){ // Sort the members of the "entities" group according to their y value, so that they overlap nicely
    Game.entities.sort('y', Phaser.Group.SORT_ASCENDING);
};

Game.update = function(){ // Main update loop of the client
    if(!Game.playerIsInitialized) return;
    var cell = Game.computeTileCoords(game.input.activePointer.worldX, game.input.activePointer.worldY);
    Game.markerPosition.x = cell.x * Game.map.tileWidth;
    Game.markerPosition.y = cell.y * Game.map.tileWidth;

    if(Game.chatInput.visible && !Game.chatInput.focus) Game.toggleChat(); // Trick to make the chat react to pressing "enter"

    if(Game.player.hasMoved()) Game.checkCameraBounds();

    if(Game.markerHasMoved()) {
        Game.computeView();
        Game.marker.visible = (Game.marker.canSee && Game.view.contains(Game.markerPosition.x,Game.markerPosition.y));

        if (Game.marker.visible) { // Check if the tile below the marker is collidable or not, and updae the marker accordingly
            //var tiles = [];
            var collide = false;
            for (var l = 0; l < Game.map.gameLayers.length; l++) {
                var tile = Game.map.getTile(cell.x, cell.y, Game.map.gameLayers[l]);
                if (tile) {
                    //tiles.push(tile.index);
                    var tileProperties = Game.map.tileset.tileProperties[tile.index - Game.map.tileset.gid];
                    if (tileProperties) {
                        if (tileProperties.hasOwnProperty('c')) {
                            collide = true;
                            break;
                        }
                    }
                }
            }
            //console.log(tiles);

            Game.updateMarker(Game.markerPosition.x, Game.markerPosition.y, collide);
            Game.previousMarkerPosition.set(Game.markerPosition.x, Game.markerPosition.y);
        }
    }
};

Game.render = function(){ // Use to display debug information, not used in production
    /*game.debug.cameraInfo(game.camera, 32, 32);
    Game.entities.forEach(function(sprite){
        game.debug.spriteBounds(sprite);
    },this);
    game.debug.spriteBounds(Game.player);
    game.debug.text(game.time.fps || '--', 2, 14, "#00ff00");*/
};