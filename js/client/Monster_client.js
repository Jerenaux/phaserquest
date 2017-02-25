/**
 * Created by Jerome on 25-02-17.
 */


function Monster(x,y,key){
    // key is a string indicating the atlas to use for the texture
    Being.call(this,x,y,key);
    this.isPlayer = false;
    this.addChild(game.add.sprite(0,0, 'atlas1','shadow'));
    Game.setHoverCursors(this,Game.fightCursor);
    this.inputEnabled = true;
    this.events.onInputUp.add(Game.handleMonsterClick, this);
    this.inFight = false;
    this.orientation = game.rnd.between(1,4);
    this.initialPosition = new Phaser.Point(x,y);
}
Monster.prototype = Object.create(Being.prototype);
Monster.prototype.constructor = Monster;

Monster.prototype.setUp = function(key){
    // key is a string use as a key in Game.monstersInfo to fetch the necessary information about the monster to create
    // it's also used as part of the frame names to use (e.g. rat, red_0, rat_1, ...)
    this.frameName = key+'_0';
    this.monsterName = key;
    this.anchor.set(0.25,0.2);
    this.absorbProperties(Game.monstersInfo[key]);
    if(this.customAnchor){
        this.anchor.x = this.customAnchor.x;
        this.anchor.y = this.customAnchor.y;
    }
    this.maxLife = this.life;
    Game.entities.add(this);
    this.setAnimations(this);
    this.idle(false);
};

Monster.prototype.prepareMovement = function(path,action,delta){
    if(!path) return;
    if(this.tween){
        this.stopMovement(false);
        //path[0] = this.adjustStartPosition(path[0]);
    }
    this.pathfindingCallback(0,action,delta,false,path); // false : send to server
};

// fight and fightAction: see the equicalents in Player
Monster.prototype.fight = function(){
    this.inFight = true;
    this.fightTween = game.add.tween(this);
    this.fightTween.to({}, Phaser.Timer.SECOND, null, false, 150, -1); // Small delay to allow the player to finish his movement, -1 for looping
    this.fightTween.onStart.add(function(){this.fightAction();}, this);
    this.fightTween.onLoop.add(function(){this.fightAction();}, this);
    this.fightTween.start();
};

Monster.prototype.fightAction = function(){
    if(Date.now() - this.lastAttack < 900) return;
    this.lastAttack = Date.now();
    if(!this.target) return;
    if(this.target.isPlayer) return;
    var direction = Game.adjacent(this,this.target);
    if(direction > 0) {
        if(this.tween){
            this.tween.stop();
            this.tween = null;
        }
        this.orientation = direction;
        this.attack();
    }
};

Monster.prototype.die = function(animate){
    this.endFight();
    this.target = null;
    this.alive = false;
    if(animate) {
        this.animate('death',false);
        //Game.sounds.kill.play();
        Game.sounds.play('kill2');
    }
    this.delayedKill(500);
};

Monster.prototype.respawn = function(){
    this.revive(); // method from the Phaser Sprite class
    this.orientation = game.rnd.between(1,4);
    this.position.set(this.initialPosition.x,this.initialPosition.y);
    this.life = this.maxLife;
    this.idle(true);
    Game.fadeInTween(this);
};