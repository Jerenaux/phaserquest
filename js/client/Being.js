/**
 * Created by Jerome on 14-10-16.
 */
/*
 * Author: Jerome Renaux
 * E-mail: jerome.renaux@gmail.com
 */
// Helper function to make a sprite object absorb all the properties of a provided JSON object; Object.assign() should work as well
Phaser.Sprite.prototype.absorbProperties = function(object){
    for (var key in object) {
        if (!object.hasOwnProperty(key)) continue;
        this[key] = object[key];
    }
};

// Being is the topmost class encompassing all "living" sprites, be it players, NPC or monsters (not items)
function Being(x,y,key){
    // key is the string indicating which atlas to use
    Phaser.Sprite.call(this, game, x,y,key); // Call to constructor of parent
    this.speed = 0;
    this.destination = null;
    game.add.existing(this);
}
Being.prototype = Object.create(Phaser.Sprite.prototype); // Declares the inheritance relationship
Being.prototype.constructor = Being;

Being.prototype.setAnimations = function(object){
    // object is the sprite to animate
    // Players and monsters have a bunch of similar needs in terms of animations:
    // - Moving in all 4 directions
    // - Attacking in all 4 directions
    // - Idling in all 4 directions
    // + dying
    // This function sets up the animations for all cases by specifying which frames should be used for each, based on
    // default frames or JSON data from db.json
    var frames = this.frames || this.defaultFrames;
    var framePrefix;
    if(object == this.weapon) {
        frames = this.defaultFrames;
        framePrefix = this.weapon.name;
    }else{
        framePrefix = (object instanceof Monster ? this.monsterName : this.armorName);
    }
    var rates = { // Rates of the different kinds of animations
      "": 8,
      "idle_": (frames.hasOwnProperty('idle_rate') ? frames.idle_rate : 2),
      "attack_": 14
    };
    var deathframes;
    if(frames.hasOwnProperty('death')) { // Fetch death animation, or make a default one
        deathframes = Phaser.Animation.generateFrameNames(framePrefix+'_', frames.death[0], frames.death[1]);
    }else{
        deathframes = Phaser.Animation.generateFrameNames('death_',0,5);
    }
    object.animations.add('death', deathframes, 8, false);
    var prefixes = ['','idle_','attack_'];
    var directions = ['down','up','left','right'];
    for(var p =0; p < prefixes.length; p++) {
        for (var d = 0; d < directions.length; d++) {
            var animation = prefixes[p]+directions[d];
            if(frames.hasOwnProperty(animation)) {
                // The frames data for a given animation in the JSON is an array of two (optionally three) values :
                // 0 : number of the beginning frame of the animation
                // 1 : number of the end frame of the animation
                // (2 : number of the frame to come back to at the end of the animation, if not end frame)
                // The final animation will consist in all frames between begin and end, + the optional comeback frame
                var fms = Phaser.Animation.generateFrameNames(framePrefix+'_', frames[animation][0], frames[animation][1]);
                if(frames[animation][2]) fms.push(framePrefix+'_'+frames[animation][2]); // if comeback frame, add it
                object.animations.add(animation, fms, rates[prefixes[p]], (prefixes[p] == 'attack_' ? false : true)); // The last boolean is whether the animation should loop or not ; always the case except for attacks
            }
        }
    }
};

Being.prototype.idle = function(force){ // Start idling animation, in the appropriate orientation
    // force is a boolean to indicate if the animation should be forced to play, or if it can depend from the situation (see animate() )
    this.animate('idle_' + orientationsDict[this.orientation],force);
};

Being.prototype.attackAndDisplay = function(hp){ // Attack a target and display HP above it subsequently
    // hp is the integer of hit points to display
    if(!this.target) return;
    this.attack();
    this.target.displayHP(hp);
};

Being.prototype.attack = function(){
    if(!this.target) return;
    var direction = Game.adjacent(this,this.target);
    if(direction > 0) this.orientation = direction;
    this.animate('attack_' + orientationsDict[this.orientation], false);
    if (this.inCamera) {
        var sound = (this instanceof Player ? 'hit1' : 'hurt');
        Game.sounds.play(sound);
    }
    if(this.target.deathmark){
        setTimeout(function(_target){
            _target.die(true);
        },500,this.target);
    }
    this.idle();
};

Being.prototype.flagForDeath = function(){
  this.deathmark = true;
};

Being.prototype.displayHP = function(hp){
    // hp is the integer of hit points to display
    var color = (this.isPlayer ? (hp >= 0 ? 'heal' : 'hurt') : 'hit');
    Game.displayHP(hp,color,this,Game.HPdelay);
    if(this.isPlayer && hp > 0) Game.sounds.play('heal');
};

Being.prototype.endFight = function(){
    if(this.fightTween) this.fightTween.stop();
    this.fightTween = null;
    this.inFight = false;
    this.deathmark = false;
    this.idle(false);
    // don't nullify target
};

Being.prototype.adjustStartPosition = function(start){
    // Prevents small "hiccups" in the tween when changing direction while already moving
    // start is a 2-tuple of the coordinates of the starting position to adjust
    switch(this.orientation){
        case 3: // right
            if(this.x%32 != 0) start.x++;
            break;
        case 4: // down
            if(this.y%32 != 0) start.y++;
            break;

    }
    return start;
};

Being.prototype.pathfindingCallback = function(finalOrientation,action,delta,sendToServer,path){
    // This function is called when the pathfinding algorithm has successfully found a path to navigate
    // finalOrientation is a value between 1 and 4 indicatinh the orientation the player should have at the end of the path
    // action is a small object containing data about what to do once the path is ended (talk to NPC, fight monster, ...)
    // delta is some value based on latency, that will slightly adjust the speed of the movement to compensate for the latency
    // sendToServer is a boolean indicating if the computed path should be sent to the server (because it's the path that the player wants to follow)
    // path is an array of 2-tuples of coordinates
    if(path === null && this.isPlayer) {
        Game.moveTarget.visible = false;
        Game.marker.visible = true;
    }else if(path !== null){
        if(action.action == 3 || action.action == 4){ // fight or chest
            finalOrientation = Game.computeFinalOrientation(path);
            path.pop(); // The player should stop right before the target, not at its location
        }
        var actionToSend = (action.action != 1 ? action : {action:0});
        if(this.isPlayer && sendToServer && path.length) Client.sendPath(path,actionToSend,finalOrientation);
        this.move(path,finalOrientation,action,delta);
    }
};

Being.prototype.move = function(path,finalOrientation,action,delta){
    // This function make a sprite move according to a determined path
    // action is a small object containing data about what to do once the path is ended (talk to NPC, fight monster, ...)
    // delta is some value based on latency, that will slightly adjust the speed of the movement to compensate for the latency
    // (e.g. if you receive information that player A moved to a specific location, but you have 200ms latency, A should
    // move 200ms faster to arrive at the end location at the same time as he would if you had received the message instantly)
    if(!path.length ){
        this.finishMovement(finalOrientation,action);
        return;
    }
    // Converts the cell coordinates in pixels coordinates, for the movement tween
    var x_steps = [];
    var y_steps = [];
    for(var q = 0; q < path.length; q++){
        x_steps.push(path[q].x*Game.map.tileWidth);
        y_steps.push(path[q].y*Game.map.tileWidth);
    }
    var tween = game.add.tween(this);
    this.lastOrientationCheck = 0; // timestamp at which the orientation of the sprite was checked for the last time
    var duration = Math.ceil(Math.max(1,path.length*this.speed - delta)); // duration of the movement, based on player speed, path length and latency
    tween.to({x: x_steps,y:y_steps}, duration);
    var checkRate = (this instanceof Player ? 0.7 : 0.4); // Rate at which the orientation of the sprite will be checked (see below)
    tween.onUpdateCallback(function(){
        // At a regular interval (not each frame!), check in which direction the sprite has moved and change its orientation accordingly
        if(Date.now() - this.lastOrientationCheck < this.speed*checkRate) return;
        this.lastOrientationCheck = Date.now();
        if(this.position.x > this.previousPosition.x){ // right
            this.orient(3);
        }else if(this.position.x < this.previousPosition.x) { // left
            this.orient(1);
        }else if(this.position.y > this.previousPosition.y) { // down
            this.orient(4);
        }else if(this.position.y < this.previousPosition.y) { // up
            this.orient(2);
        }
        this.animate(orientationsDict[this.orientation],false);
    },this);
    tween.onComplete.add(function () {
        this.finishMovement(finalOrientation, action);
    }, this);
    this.tween = tween;
    tween.start();
};

Being.prototype.orient = function(orientation){
    // orientation is a value between 1 and 4 (see orientationsDict)
    if(this.orientation != orientation) this.orientation = orientation;
};

Being.prototype.stopMovement = function(complete){
    // complete is a boolean indicating if the onComplete callback should be called
    this.tween.stop(complete);
    this.tween = null;
};

Being.prototype.setPosition = function(x,y){
    this.x = x*Game.map.tileWidth;
    this.y = y*Game.map.tileHeight;
};

Being.prototype.finishMovement = function(finalOrientation,action){
    // Called whenever a path has been travelled to its end; based on the action object, the appropriate action is taken
    // finalOrientation is a value between 1 and 4 indicatinh the orientation the player should have at the end of the path
    // action is a small object containing data about what to do once the path is ended (talk to NPC, fight monster, ...)
    if(this.isPlayer) {
        if (action.action == 1) { // talk
            action.character.displayBubble(action.text);
            if(!Game.speakAchievement) Game.handleSpeakAchievement();
        }
        Game.moveTarget.visible = false;
        Game.handleLocationAchievements();
    }
    if(this instanceof Player) { // Check if the path ends on a teleport, and if so, teleport player
        var door = Game.detectElement(Game.doors,this.x,this.y);
        if(door) finalOrientation = this.teleport(door);
    }
    if(finalOrientation) this.orient(finalOrientation);
    this.tween = null;
    this.idle(false);
    Game.sortEntities();
};

Being.prototype.hasMoved = function(){
    return (this.position.x != this.previousPosition.x) || (this.position.y != this.previousPosition.y);
};

Being.prototype.animate = function(animation,force){
    // Manage animations, depending on which animation is requested and which one is currently playing
    // animation is the string of the name of the animation to play (death, attack_left, idle_right...)
    if(animation == 'death' || force) { // If the requested animation is death, or the "force" flag is true, start the requested animation no matter what
        this.animations.stop();
        this.animations.play(animation);
        if(this.weapon) this.weapon.animations.play(animation); // Weapon and character animations always need to be the same
        return;
    }
    var currentAnim = this.animations.currentAnim;
    if(currentAnim.name == 'death') return; // If the currently playing animation is death, cancel the play of any other animation
    if(currentAnim.isPlaying && !currentAnim.loop){ // if the current animation is not looping, let it finish before playing the requested one
        if(currentAnim.name != animation) { // Make sure not to re-play the same animation
            currentAnim.onComplete.addOnce(function () {
                this.animate(animation, false);
            }, this);
        }
    }else { // if no animation is playing or it is looping, start the requested one immediately
        this.animations.play(animation);
        if (this.weapon) this.weapon.animations.play(animation);
    }
};

Being.prototype.delayedDeath = function(delay){
    setTimeout(function(_being){
        _being.die(true);
    },delay,this);
};

Being.prototype.delayedKill = function(delay){
    setTimeout(function(_being){
        _being.kill();
    },delay,this);
};