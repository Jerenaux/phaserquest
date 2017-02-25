/**
 * Created by Jerome on 26-12-16.
 */

var GameServer = require('./GameServer.js').GameServer;
var MovingEntity = require('./MovingEntity.js').MovingEntity; // Parent class of monsters and players
var PersonalUpdatePacket = require('./PersonalUpdatePacket.js').PersonalUpdatePacket;

function Player(name){
    MovingEntity.call(this);
    this.name = name;
    var startingPosition = GameServer.determineStartingPosition();
    this.x = startingPosition.x;
    this.y = startingPosition.y;
    this.setAOI();
    this.category = 'player';
    this.maxLife = 100;
    this.life = this.maxLife;
    this.speed = 120;
    this.equip(1,"sword1");
    this.equip(2,"clotharmor");
    this.updatePacket = new PersonalUpdatePacket();
    this.newAOIs = [];
}

Player.prototype = Object.create(MovingEntity.prototype); // Declares the inheritance relationship
Player.prototype.constructor = Player;

Player.prototype.setAOI = function(){
    this.aoi = this.getAOIid();
};

Player.prototype.setIDs = function(dbId,socketId){
    this.id = GameServer.lastPlayerID++;
    GameServer.IDmap[this.id] = dbId;
    this.socketID = socketId;
};

Player.prototype.getMongoID = function(){
    return GameServer.IDmap[this.id];
};

Player.prototype.setLastSavedPosition = function(){
    this.lastSavedPosition = {x:this.x,y:this.y};
};

Player.prototype.resetPosition = function(){
    this.setProperty('x',this.lastSavedPosition.x);
    this.setProperty('y',this.lastSavedPosition.y);
};

Player.prototype.trim = function(){
    // Return a smaller object, containing a subset of the initial properties, to be sent to the client
    var trimmed = {};
    var broadcastProperties = ['id','name','weapon','armor','inFight','alive','aoi']; // list of properties relevant for the client
    for(var p = 0; p < broadcastProperties.length; p++){
        trimmed[broadcastProperties[p]] = this[broadcastProperties[p]];
    }
    trimmed.x = parseInt(this.x);
    trimmed.y = parseInt(this.y);
    if(this.route) trimmed.route = this.route.trim(this.category);
    if(this.target) trimmed.targetID = this.target.id;
    return trimmed;
};

Player.prototype.dbTrim = function(){
    // Return a smaller object, containing a subset of the initial properties, to be stored in the database
    var trimmed = {};
    var dbProperties = ['x','y','name']; // list of properties relevant to store in the database
    for(var p = 0; p < dbProperties.length; p++){
        trimmed[dbProperties[p]] = this[dbProperties[p]];
    }
    trimmed['weapon'] = GameServer.db.itemsIDmap[this.weapon];
    trimmed['armor'] = GameServer.db.itemsIDmap[this.armor];
    return trimmed;
};

Player.prototype.getDataFromDb = function(document){
    // Set up the player based on the data stored in the databse
    // document is the mongodb document retrieved form the database
    var dbProperties = ['x','y','name'];
    for(var p = 0; p < dbProperties.length; p++){
        this[dbProperties[p]] = document[dbProperties[p]];
    }
    this.setAOI();
    this.equip(1,document['weapon']);
    this.equip(2,document['armor']);
};

Player.prototype.getIndividualUpdatePackage = function(){
    if(this.updatePacket.isEmpty()) return null;
    var pkg = this.updatePacket;
    this.updatePacket = new PersonalUpdatePacket();
    return pkg;
};

Player.prototype.getPathEnd = function(){
    return {x:this.route.path[this.route.path.length-1].x,y:this.route.path[this.route.path.length-1].y};
};

Player.prototype.updateFight = function(){
    this.lastFightUpdate = Date.now();
    if(!this.target || !this.target.alive) return;
    var direction = GameServer.adjacentNoDiagonal(this,this.target);
    if(direction > 0) this.damage();
};

Player.prototype.regenerate = function(){
    this.updateLife(2);
};

Player.prototype.equip = function(type,item){
    var equipInfo = GameServer.db.items[item];
    if(type == 1){
        this.atk = equipInfo.atk;
        this.setProperty('weapon',equipInfo.id);
    }else if(type == 2){
        this.def = equipInfo.def;
        this.setProperty('armor',equipInfo.id);
    }
};

Player.prototype.applyItem = function(item){
    var itemInfo = GameServer.db.items[item.itemKey];
    if(itemInfo === undefined){
        console.error('WARNING : undefined data for item : ');
        console.log(item);
        return;
    }
    var picked = true;
    if(itemInfo.heals){
        var difference = this.updateLife(itemInfo.heals);
        this.updatePacket.addHP(false,difference); /// false = self
        this.updatePacket.addUsed(itemInfo.id);
    }else if(itemInfo.equip){
        var equipInfo = GameServer.db.items[itemInfo.equip];
        var type = equipInfo.type;
        if(type == 1){ // Weapon
            if(this.atk >= equipInfo.atk){ // don't pick up if a better item is already equipped
                this.updatePacket.addNoPick();
                picked = false;
            }
        }else if(type == 2){ // Armor
            if(this.def >= equipInfo.def){
                this.updatePacket.addNoPick();
                picked = false;
            }
        }
        if(picked){
            this.equip(type,itemInfo.equip);
            if(this.x < 92) GameServer.savePlayer(this);
            this.updatePacket.addUsed(equipInfo.id);
        }
    }
    return picked;
};

Player.prototype.teleport = function(door){
    this.x = door.to.x;
    this.y = door.to.y;
    this.manageFoes();
    this.endFight();
};

Player.prototype.revive = function(){
    if(this.alive) return;
    this.life = this.maxLife;
    this.resetPosition();
    this.setProperty('alive',true);
    this.updatePacket.updatePosition(this.x,this.y);
};

module.exports.Player = Player;