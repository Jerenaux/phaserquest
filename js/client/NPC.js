/**
 * Created by Jerome on 25-02-17.
 */

function NPC(x,y,key){
    // key is a string use as a key in Game.npcInfo to fetch the necessary information about the NPC to create
    Human.call(this,x,y,'atlas1');
    this.rate = 2; // animation rate
    this.absorbProperties(Game.npcInfo[key]);
    if(this.customAnchor){
        this.anchor.set(this.customAnchor.x,this.customAnchor.y);
    }else {
        this.anchor.set(0, 0.25);
    }
    this.addChild(game.add.sprite(0, 4, 'atlas1','shadow'));
    Game.setHoverCursors(this, Game.talkCursor);
    var tile = Game.computeTileCoords(this.x, this.y);
    Game.collisionArray[tile.y][tile.x] = 1; // So that you have to walk around NPC
    this.events.onInputUp.add(Game.handleCharClick, this);
}
NPC.prototype = Object.create(Human.prototype);
NPC.prototype.constructor = NPC;