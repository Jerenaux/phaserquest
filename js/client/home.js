/**
 * Created by Jerome on 09-02-17.
 */

var Home = {
    maxNameLength : 20 // max length of the name of the player
};

Home.init = function(){
    if(game.device.desktop == false){
        console.log('W : '+window.screen.width+', H : '+window.screen.height);
        if(Math.min(window.screen.width,window.screen.height) < game.width) { // If at least one of the two screen dimensions is smaller for the game, enable asking for device reorientation
            game.scale.scaleMode = Phaser.ScaleManager.RESIZE;
            game.scale.forceOrientation(true,false);
        }
    }
    game.scale.pageAlignHorizontally = true;
    game.add.plugin(Fabrique.Plugins.InputField); // https://github.com/orange-games/phaser-input
    Game.isNewPlayer = Client.isNewPlayer();
};

Home.preload = function(){
    game.load.atlasJSONHash('atlas1', 'assets/sprites/atlas1.png', 'assets/sprites/atlas1.json'); // PNJ, HUD, marker, achievements ...
    game.load.atlasJSONHash('atlas3', 'assets/sprites/atlas3.png', 'assets/sprites/atlas3.json'); // Items, weapons, armors
    game.load.json('db', 'assets/json/db.json');

    // https://phaser.io/examples/v2/audio/play-music
    game.load.audio('intro', ['assets/music/phaser-quest-intro.ogg']);
};

Home.create = function(){
    Game.db = game.cache.getJSON('db');
    if(game.device.desktop == false)
    {
        game.scale.enterIncorrectOrientation.add(Game.displayOrientationScreen, this);
        game.scale.leaveIncorrectOrientation.add(Game.removeOrientationScreen, this);
    }
    if(!Game.isNewPlayer) Home.makeResetScroll();
    Home.displayHomeScroll();
    Home.displayLogo();
    Home.music = game.add.audio('intro');
    Home.music.play();
    document.onkeydown = Home.handleKeyPress;
};

Home.displayHomeScroll = function(){
    if(!Home.scroll) Home.makeHomeScroll();
    if(Home.resetScroll && Home.resetScroll.visible) Home.resetScroll.hideTween.start();
    Home.scroll.visible = true;
    Home.scroll.showTween.start();
};

Home.displayLogo = function(){
    Home.logo = game.add.sprite(0, 20, 'atlas1', 'logo');
    Home.logo.anchor.set(0.5,0);
    Home.logo.x = game.width/2;
    Home.logo.hideTween = game.add.tween(Home.logo);
    Home.logo.hideTween.to({alpha: 0}, Phaser.Timer.SECOND*0.2);
};

Home.displayLinks = function(){
    var x = Home.makeLink(300,'About',function(){console.log('about')},true);
    x = Home.makeLink(x+30,'Credits',function(){console.log('credits')},true);
    x = Home.makeLink(x+30,'License',function(){console.log('license')},true);
};

Home.makeLink = function(x,text,callback,hyphen){
    var color = '#b2af9b';
    var style = {font: '18px pixel',fill:color};
    var y = 430;
    var link = game.add.text(x,y,text,style);
    link.inputEnabled = true;
    link.events.onInputOver.add(function(txt){
        txt.addColor('#f4d442',0);
    }, this);
    link.events.onInputOut.add(function(txt){
        txt.addColor(color,0);
    }, this);
    link.events.onInputDown.add(callback, this);
    if(hyphen) {
        var hyphen = game.add.text(link.x+link.width+10,y,' - ',style);
        return hyphen.x;
    }
    return link.x;
};

Home.makeScroll = function(){
    var scroll = game.add.sprite(0,0,'atlas1','scroll_1');
    scroll.x = game.width/2 - scroll.width/2;
    scroll.y = game.height/2 - scroll.height/2;
    scroll.addChild(game.add.sprite(-78,0,'atlas1','scroll_3'));
    scroll.addChild(game.add.sprite(scroll.width,0,'atlas1','scroll_2'));
    scroll.fixedToCamera = true;
    scroll.alpha = 0;
    scroll.visible = false;
    return scroll;
};

Home.setFadeTweens = function(element){
    var speedCoef = 0.2;
    element.showTween = game.add.tween(element);
    element.hideTween = game.add.tween(element);
    element.showTween.to({alpha: 1}, Phaser.Timer.SECOND*speedCoef);
    element.hideTween.to({alpha: 0}, Phaser.Timer.SECOND*speedCoef);
    element.hideTween.onComplete.add(function(){
        element.visible = false;
    },this);
};

Home.makeHomeScroll = function(){
    Game.isNewPlayer = Client.isNewPlayer();
    Home.scroll = Home.makeScroll();
    Home.setFadeTweens(Home.scroll);

    Home.makeTitle(Home.scroll,(Game.isNewPlayer ? 'Create a new character' : 'Load existing character'));

    var buttonY;
    var player;
    if(Game.isNewPlayer){
        player = Home.scroll.addChild(game.add.sprite(0, 110, 'atlas3', 'clotharmor_31'));
        player.alpha = 0.5;
        Home.inputField = Home.scroll.addChild(game.add.inputField(185, 160,{
            width: 300,
            padding: 10,
            fill: '#000',
            stroke: '#fff',
            backgroundColor: '#d0cdba',
            borderWidth: 2,
            borderColor: '#b2af9b',
            borderRadius: 3,
            font: '18px pixel',
            placeHolder: 'Name your character',
            placeHolderColor: '#b2af9b',
            cursorColor: '#b2af9b',
            max: Home.maxNameLength
        }));
        Home.inputField.x = Home.scroll.width/2 - Home.inputField.width/2;
        Home.inputField.input.useHandCursor = false;
        buttonY = 220;
    }else {
        player = Home.scroll.addChild(game.add.sprite(0, 100, 'atlas3', Client.getArmor()+'_31'));
        var wpn = Client.getWeapon();
        var weapon = player.addChild(game.add.sprite(0, 0, 'atlas3', wpn+'_31'));
        weapon.position.set(Game.db.items[wpn].offsets.x, Game.db.items[wpn].offsets.y);
        var name = player.addChild(game.add.text(0,42, Client.getName(), {
            font: '18px pixel',
            fill: "#fff",
            stroke: "#000000",
            strokeThickness: 3
        }));
        name.x = Math.floor(12 - (name.width/2));
        Home.makeScrollLink(Home.scroll,'Reset your character',Home.displayResetScroll);
        buttonY = 180;
    }
    player.addChild(game.add.sprite(0,5, 'atlas1','shadow'));
    player.anchor.set(0.25,0.35);
    Home.button = Home.makeButton(Home.scroll,buttonY,'play',Home.startGame);
    if(Game.isNewPlayer) Home.disableButton();
    player.x = Home.button.x - 18;
};

Home.makeTitle = function(scroll,txt){
    var titleY = 65;
    var title = scroll.addChild(game.add.text(0, titleY, txt,{
        font: '18px pixel',
        fill: "#f4d442",
        stroke: "#000000",
        strokeThickness: 3
    }));
    title.x = scroll.width/2;
    title.anchor.set(0.5);
    scroll.addChild(game.add.sprite(title.x - 170,titleY-12,'atlas1','stache_0'));
    scroll.addChild(game.add.sprite(title.x + 105,titleY-12,'atlas1','stache_1'));
};

Home.makeButton = function(scroll,buttonY,frame,callback){
    var button = scroll.addChild(game.add.button(210,buttonY, 'atlas1',callback, this, frame+'_0', frame+'_0', frame+'_1'));
    button.x = scroll.width/2;
    button.anchor.set(0.5,0);
    button.input.useHandCursor = false;
    return button;
};

Home.makeScrollLink = function(scroll,text,callback){
    var link = scroll.addChild(game.add.text(0,310,text,{
        font: '16px pixel',
        fill: "#fff",
        stroke: "#000",
        strokeThickness: 3
    }));
    link.x = scroll.width/2;
    link.anchor.set(0.5);
    link.inputEnabled = true;
    link.events.onInputOver.add(function(txt){
        txt.addColor('#f4d442',0);
    }, this);
    link.events.onInputOut.add(function(txt){
        txt.addColor('#fff',0);
    }, this);
    link.events.onInputDown.add(callback, this);
};


Home.displayResetScroll = function(){
    if(!Home.resetScroll) Home.makeResetScroll();
    Home.scroll.hideTween.start();
    Home.resetScroll.visible = true;
    Home.resetScroll.showTween.start();
};

Home.makeResetScroll = function(){
    Home.resetScroll = Home.makeScroll();
    Home.setFadeTweens(Home.resetScroll);
    Home.makeTitle(Home.resetScroll,'Reset your character?');
    var txt = Home.resetScroll.addChild(game.add.text(0,135,'All your progress will be lost. Are you sure?',{
        font: '18px pixel',
        fill: "#000"
    }));
    Home.makeButton(Home.resetScroll,180,'delete',Home.deletePlayer);
    txt.anchor.set(0.5);
    txt.x = Home.resetScroll.width/2;
    Home.makeScrollLink(Home.resetScroll,'Cancel',Home.displayHomeScroll);
};

Home.deletePlayer = function(){
    Client.deletePlayer();
    Home.scroll.destroy();
    Home.scroll = null;
    Home.displayHomeScroll();
};

Home.isNameEmpty = function(){
    return (Home.inputField.text.text.length == 0);
};

Home.startGame = function(){
    var ok = true;
    if(Game.isNewPlayer) {
        if(!Home.isNameEmpty()){
            Client.setName(Home.inputField.text.text);
        }else{
            ok = false;
        }
    }
    if(ok) {
        document.onkeydown = null;
        Home.scroll.hideTween.onComplete.add(function(){
            game.state.start('Game');
        },this);
        Home.scroll.hideTween.start();
        Home.logo.hideTween.start();
    }
};

Home.disableButton = function(){
    Home.button.setFrames('play_2','play_2','play_2');
    Home.button.inputEnabled = false;
};

Home.enableButton = function(){
    Home.button.setFrames('play_0','play_0','play_1');
    Home.button.inputEnabled = true;
};

Home.handleKeyPress = function(e){
    e = e || window.event;
    if(e.keyCode == 13) Home.startGame();
};

Home.update = function () {
    if(Home.inputField) {
        Home.inputField.update();
        if (Home.button.inputEnabled) {
            if (Home.isNameEmpty()) Home.disableButton();
        } else {
            if (!Home.isNameEmpty()) Home.enableButton();
        }
    }
};