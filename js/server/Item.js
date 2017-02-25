/**
 * Created by Jerome on 24-02-17.
 */


var GameServer = require('./GameServer.js').GameServer;
var GameObject = require('./GameObject.js').GameObject; // Parent class of all game objects : players, monsters and items (not NPC because they are not processed server-side)

function Item(x,y,content,respawn,chest,loot){
    this.id = GameServer.lastItemID++;
    this.x = x;
    this.y = y;
    this.category = 'item';
    // content is the array of possible items in case of a chest, or the item itself in case of non-chest ;
    // 'item' will be the final content, randomly picked from 'content' in setContent()
    this.content = content;
    this.respawn = respawn; // can the item respawn after being piked (boolean)
    this.chest = chest; // is the item contained in a chest (boolean)
    this.inChest = chest; // is the item currently within its chest, or has the chest been opened (boolean)
    this.loot = loot; // is the item some loot from a monster (boolean) ; only used client-side
    this.spawn();
}

Item.prototype = Object.create(GameObject.prototype); // Declares the inheritance relationship
Item.prototype.constructor = Item;

Item.prototype.trim = function(){
    var trimmed = {};
    var broadcastProperties = ['id','x','y','itemID','visible','respawn','chest','inChest','loot'];
    for(var p = 0; p < broadcastProperties.length; p++){
        trimmed[broadcastProperties[p]] = this[broadcastProperties[p]];
    }
    return trimmed;
};

Item.prototype.pick = function(){
    if(!this.visible) return;
    this.setProperty('visible',false);
    if(this.respawn) {
        GameServer.respawnCount(this.x, this.y, this, this.spawn, GameServer.itemRespawnDelay);
    }else{
        GameServer.removeFromLocation(this);
    }
};

Item.prototype.open = function(){
    this.setProperty('inChest',false);
    this.makeTemporary();
};

Item.prototype.makeTemporary = function(){
    setTimeout(function(item){
        item.pick();
    },GameServer.itemVanishDelay,this);
};

Item.prototype.spawn = function(){
    this.setProperty('inChest',this.chest);
    this.setProperty('visible',true);
    this.setContent();
};

Item.prototype.setContent = function(){
    if(this.content === undefined) this.content = 'item-flask';
    var content = this.content.split(",");
    var item = (this.chest ? "item-" : "")+content[Math.floor(Math.random()*content.length)];
    var itemID = (GameServer.db.items[item] ? GameServer.db.items[item].id : 100);
    this.itemKey = item;
    this.setProperty('itemID',itemID);
};

module.exports.Item = Item;