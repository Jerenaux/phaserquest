/**
 * Created by Jerome on 25-02-17.
 */

function Player(x,y,key){
    // key is a string indicating the atlas to use as texture
    Human.call(this,x,y,key); // Send context as first argument!!
    this.anchor.set(0.25,0.35);
    this.orientation = 4; // down
    this.speed = Game.playerSpeed;
    this.dialoguesMemory = {};
    this.maxLife = Game.playerLife;
    this.life = this.maxLife;
    this.inFight = false;
    this.defaultFrames = {
        // the third value is the frame to come back to at the end of the animation
        "attack_right": [0,4,9],
        "right": [5, 8],
        "idle_right": [9, 10],
        "attack_up": [11,15,20],
        "up": [16, 19],
        "idle_up": [20, 21],
        "attack_down": [22,26,31],
        "down": [27, 30],
        "idle_down": [31, 32],
        "attack_left": [33,37,42],
        "left": [38, 41],
        "idle_left": [42, 43]
    };
    this.addChild(this.weapon = game.add.sprite(0,0,'atlas3'));
    this.addChild(this.shadow = game.add.sprite(0,5, 'atlas1','shadow'));
    this.addChild(this.nameHolder = game.add.text(0,-30, '', {
        font: '14px pixel',
        fill: "#ffffff",
        stroke: "#000000",
        strokeThickness: 2
    }));
    this.events.onKilled.add(function(player){
        Game.displayedPlayers.delete(player.id);
    },this);
}
Player.prototype = Object.create(Human.prototype);
Player.prototype.constructor = Player;

Player.prototype.setIsPlayer = function(flag){ // sets the isPlayer flag to true or false to indicate if a sprite is the main player or another player
    this.isPlayer = flag;
    if(this.isPlayer) this.nameHolder.addColor("#f4d442",0);
};

Player.prototype.setName = function(name) {
    this.nameHolder.text = name;
    this.nameHolder.x = Math.floor(16 - (this.nameHolder.width/2));
};

Player.prototype.prepareMovement = function(end,finalOrientation,action,delta,sendToServer){
    // Handles the necessary caretaking preliminary to moving the player
    if(!this.alive) return;
    if(!end) return;
    var start = Game.computeTileCoords(this.x,this.y);
    if (start.x == end.x && start.y == end.y) {
        if(action.action == 1) this.finishMovement(finalOrientation,action);
        return;
    }
    if(this.isPlayer) Game.manageMoveTarget(end.x,end.y);
    if(this.tween){
        this.stopMovement(false);
        start = this.adjustStartPosition(start);
    }
    if(this.isPlayer && this.inFight && action.action != 3) this.endFight();
    Game.easystar.findPath(start.x, start.y, end.x, end.y, this.pathfindingCallback.bind(this,finalOrientation,action,delta,sendToServer));
    Game.easystar.calculate();
};

Player.prototype.equipWeapon = function(key){
    // key is a string use as a key in Game.itemsInfo to fetch the necessary information about the item to equip
    // it's also used as part of the frame names to use (e.g. redsword_0, redsword_1, ...)
    this.weapon.name = key;
    this.weapon.frameName = key+'_0';
    this.weapon.absorbProperties(Game.itemsInfo[key]);
    this.atk = this.weapon.atk;
    this.adjustWeapon();
    this.setAnimations(this.weapon);
    if(this.isPlayer){
        Game.weaponIcon.frameName = this.weapon.icon+'_0';
        Client.setWeapon(key);
    }
    return true;
};

Player.prototype.adjustWeapon = function(){
    this.weapon.position.set(this.weapon.offsets.x, this.weapon.offsets.y);
};

Player.prototype.equipArmor = function(key){
    // key is a string use as a key in Game.itemsInfo to fetch the necessary information about the item to equip
    // it's also used as part of the frame names to use (e.g. redsword_0, redsword_1, ...)
    var armorInfo = Game.itemsInfo[key];
    this.def = armorInfo.def;
    this.armorName = key;
    this.frameName = key+'_0';
    if(this.isPlayer) {
        Game.armorIcon.frameName = armorInfo.icon+'_0';
        Client.setArmor(key);
        Game.armorIcon.anchor.set(0,0);
        if(armorInfo.iconAnchor) Game.armorIcon.anchor.set(armorInfo.iconAnchor.x,armorInfo.iconAnchor.y);
    }
    var animationFrames = (armorInfo.hasOwnProperty('frames')? armorInfo.frames : null);
    this.frames = animationFrames;
    this.setAnimations(this);
    return true;
};

Player.prototype.updateLife = function(){ // Update the life bar to reflect the amout of health of the player
    if(this.life < 0) this.life = 0;
    var width = Game.computeLifeBarWidth();
    var tweenWidth = game.add.tween(Game.health.getChildAt(0)); // tween for the "body" of the bar
    var tweenEnd = game.add.tween(Game.health.getChildAt(1)); // tween for the curved tip
    tweenWidth.to({width: width }, 200,null, false, 200);
    tweenEnd.to({x: width }, 200,null, false, 200);
    tweenWidth.start();
    tweenEnd.start();
};

Player.prototype.teleport = function(){
    var cell = Game.computeTileCoords(this.x,this.y);
    var door = Game.doors.getFirst(cell.x,cell.y);
    if(door){
        this.position.set(door.to.x, door.to.y);
        if(this.isPlayer) {
            if (door.camera && !door.follow) { // if the camera cannot follow the player but has to be fixed at specific coordinates
                Game.unfollowPlayer();
                game.camera.x = door.camera.x;
                game.camera.y = door.camera.y;
            } else if(door.follow) { // if the camera can follow, but indoors and within possible bounds
                Game.followPlayerIndoors(door.min_cx,door.min_cy,door.max_cx,door.max_cy);
            }else{
                Game.followPlayer();
            }
        }
        var orientationMap = {
            l: 1,
            u: 2,
            r: 3,
            d: 4
        };
        return orientationMap[door.orientation];
    }
    return null;
};

Player.prototype.fight = function(){
    // Sets the player in "fight mode", and start a tween that calls fightAction() regularly in order to display the attack animations
    if(!this.target) return;
    this.inFight = true;
    this.fightTween = game.add.tween(this);
    this.fightTween.to({}, Phaser.Timer.SECOND, null, false, 0, -1);
    this.fightTween.onStart.add(function(){this.fightAction();}, this);
    this.fightTween.onLoop.add(function(){this.fightAction();}, this);
    this.fightTween.start();
};

Player.prototype.fightAction = function(){
    // Checks if the target is on an adjacent cell, and if yes, triggers attack animation
    if(this.isPlayer) return; // For the main player, attack animations are handled differently, see updateSelf()
    var direction = Game.adjacent(this,this.target);
    if(direction > 0){ // Target is on adjacent cell
        if(this.tween){
            this.tween.stop();
            this.tween = null;
        }
        this.orientation = direction;
        this.attack();
    }
};

Player.prototype.die = function(animate){
    // animate is a boolean indicating if the death animation should be played (if not, the sprite simply disappears)
    if(this.tween) this.stopMovement(false);
    this.endFight();
    this.target = null;
    this.life = 0;
    if(this.isPlayer) {
        Game.moveTarget.visible = false;
        this.updateLife();
        setTimeout(Game.displayDeathScroll,Phaser.Timer.SECOND*2);
    }
    if(animate && this.inCamera) {
        this.frameName = 'death_0';
        this.animate('death', false);
        Game.sounds.play('death');
    }
    this.delayedKill(750);
};

Player.prototype.respawn = function(){
    this.revive(); // method from the Phaser Sprite class
    this.orientation = game.rnd.between(1,4);
    if(this.isPlayer) {
        this.life = this.maxLife;
        this.updateLife();
    }
    this.idle(true);
};