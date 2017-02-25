/**
 * Created by Jerome on 24-02-17.
 */

var GameServer = require('./GameServer.js').GameServer;
var MovingEntity = require('./MovingEntity.js').MovingEntity; // Parent class of monsters and players

function Monster(x,y,monster){
    MovingEntity.call(this);
    this.id = GameServer.lastMonsterID++;
    this.x = x;
    this.y = y;
    this.startX = x;
    this.startY = y;
    this.category = 'monster';
    var info = GameServer.db.monsters[monster];
    if(info === undefined){
        console.error('WARNING : undefined data for monster : '+monster);
        return;
    }
    this.lootTable = GameServer.formatLootTable(info.lootTable);
    this.monster = info.id; // the id of the monster (rat, ...) (int)
    this.aggro = info.aggressive;
    if(this.aggro === undefined) this.aggro = true;
    this.maxLife = info.life;
    this.life = this.maxLife;
    this.speed = info.speed;
    this.atk = info.atk;
    this.def = info.def;
    this.name = info.name;
    this.lastPositionCheck = Date.now();
}

Monster.prototype = Object.create(MovingEntity.prototype); // Declares the inheritance relationship
Monster.prototype.constructor = Monster;

Monster.prototype.trim = function(){
    var trimmed = {};
    var broadcastProperties = ['id','x','y','monster','inFight','alive'];
    for(var p = 0; p < broadcastProperties.length; p++){
        trimmed[broadcastProperties[p]] = this[broadcastProperties[p]];
    }
    if(this.route) trimmed.route = this.route.trim(this.category);
    if(this.target) trimmed.targetID = this.target.id;
    return trimmed;
};

Monster.prototype.respawn = function(){
    this.life = this.maxLife;
    GameServer.moveAtLocation(this,this.x,this.y,this.startX,this.startY);
    this.x = this.startX;
    this.y = this.startY;
    this.setProperty('alive',true);
    if(this.chestArea) this.chestArea.increment();
};

Monster.prototype.updateFight = function(){
    this.lastFightUpdate = Date.now();
    if(!this.alive || !this.target.alive) return;
    var direction = GameServer.adjacentNoDiagonal(this,this.target);
    var end;
    if(direction == -1){ // Player is on very same cell
        end = GameServer.findFreeAdjacentCell(this.x,this.y);
    }else if(direction == 0){ // Player is not on adjacent cell
        end = (this.target.route ? this.target.getPathEnd() : {x: this.target.x, y: this.target.y});
    }
    if(direction > 0){
        this.damage();
    }else{
        this.move(end,true);
    }
};

Monster.prototype.getPathEnd = function(){
    if(!this.route.path) return null;
    return {x:this.route.path[this.route.path.length-1].x,y:this.route.path[this.route.path.length-1].y};
};

Monster.prototype.checkPosition = function(){
    this.lastPositionCheck = Date.now();
    if(!this.inFight && !this.route && (this.x != this.startX || this.y != this.startY)) this.move({x:this.startX,y:this.startY},false);
};

Monster.prototype.move = function(end,fight){
    var path = GameServer.pathfinder.findPath(this.x, this.y, end.x, end.y, GameServer.PFgrid.clone());
    if(fight) path.pop();
    if(!path.length) return;
    if(path) {
        path = GameServer.convertPath(path);
        if(this.route) {
            var currentEnd = this.getPathEnd();
            if ((path[path.length - 1].x == currentEnd.x) && (path[path.length - 1].y == currentEnd.y)) return;
        }
        this.setRoute(path, Date.now(),0, undefined, undefined);
    }else{
        console.log('Error: no path found');
    }
};

module.exports.Monster = Monster;