/**
 * Created by Jerome on 25-02-17.
 */


function Item(x,y,key){
    // key is a string indicating the atlas to use for the texture
    Phaser.Sprite.call(this, game, x,y,key); // Call to constructor of parent
    game.add.existing(this);
    this.events.onKilled.addOnce(function(item){
        item.recycle();
    },this);
}
Item.prototype = Object.create(Phaser.Sprite.prototype);
Item.prototype.constructor = Item;

Item.prototype.setUp = function(content,chest,inChest,visible,respawn,loot){
    // Sets all the properties of the object and sets up its appearance.
    Game.entities.add(this);
    this.chest = chest; // boolean, is it a chest or not
    this.inChest = inChest; // boolean, is it currently in chest or has it been opened
    this.content = content; // string key of the item
    this.canRespawn = respawn; // boolean, respawnable item or not
    this.loot = loot; // boolean, was it dropped by a monster or not
    this.visible = visible; // boolean
    this.display();
    if(!this.visible) this.kill();
};

Item.prototype.display = function(){
    this.absorbProperties(Game.itemsInfo[this.content]);
    if(!this.shadow) this.shadow = this.addChild(game.add.sprite(1, 0, 'atlas1','shadow'));
    if(!this.sparks) {
        this.sparks = this.addChild(game.add.sprite(0,0, 'atlas1','sparks_0'));
        this.sparks.animations.add('glitter', Phaser.Animation.generateFrameNames('sparks_', 0, 5), 10, true);
    }
    this.sparks.animations.play('glitter');
    this.rate = 6;
    this.atlasKey = this.content; // Used in bAsicAtlasAnimation
    try {
        this.inputEnabled = true;
        Game.setHoverCursors(this, Game.lootCursor);
    }catch(e){
        console.log(e);
    }
    if(this.chest) {
        this.animations.add('open',Phaser.Animation.generateFrameNames('death_', 0, 5),8,false);
        this.events.onAnimationComplete.add(function(chest){
            chest.swapToItem();
        }, this);

        this.swapToChest();
    }else{
        this.swapToItem();
    }
};

Item.prototype.setBlinkingTween = function(){
    var tween = game.add.tween(this);
    this.blinkingTween = tween;
    var blinks = 0;
    // will blink every 200ms, 20 times (4 sec), after a delay of sec
    tween.to({},200,null, false, Phaser.Timer.SECOND*5,-1);
    tween.onLoop.add(function(item){
        item.visible = !item.visible;
        blinks++;
        if(blinks >=20) this.kill();
    }, this);
    tween.start();
};

Item.prototype.swapToChest = function(){
    this.frameName = 'chest';
    this.anchor.set(0);
    this.inChest = true;
    this.shadow.visible = false;
    this.sparks.visible = false;
    this.events.onInputUp.removeAll();
    this.events.onInputUp.add(Game.handleChestClick, this);
    Game.fadeInTween(this);
};

Item.prototype.swapToItem = function(){
    if(this.frameName != this.content) this.frameName = this.content+'_0';
    if(this.customAnchor){
        this.anchor.set(this.customAnchor.x,this.customAnchor.y);
    }else {
        this.anchor.set(0, 0.25);
    }
    this.inChest = false;
    this.shadow.visible = true;
    this.sparks.visible = true;
    if(this.chest || this.loot) this.setBlinkingTween(); // need to be set each time because stop() deletes tweens
    Game.basicAtlasAnimation(this);
    this.events.onInputUp.removeAll();
    this.events.onInputUp.add(Game.handleLootClick, this);
};

Item.prototype.remove = function(){
    if(this.canRespawn) {
        this.kill(); // Kill the sprite (we kill instead of destroying in order to reuse the sprite if it has to respawn)
    }else{
        this.destroy();
        delete Game.itemsTable[this.id];
    }

};

Item.prototype.recycle = function(){
    //if(!this.canRespawn) Game.itemFactory.graveyard.push(this);
    if(this.blinkingTween) this.blinkingTween.stop(); // If the item was blinking (because on the verge of disappearing), stop that tween
};

Item.prototype.open = function(){
    this.animations.play('open');
    Game.sounds.play('chest');
    // swapToItem() is not mentioned here, it's included as the onComplete of the animation in display()
};

Item.prototype.respawn = function(){
    this.revive();
    if(this.chest){
        this.swapToChest();
    }else{
        this.swapToItem();
        Game.fadeInTween(this);
    }
};