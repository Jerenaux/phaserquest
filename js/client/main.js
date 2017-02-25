
var game = new Phaser.Game(980, 500,
    (navigator.userAgent.toLowerCase().indexOf('firefox') > -1 ? Phaser.CANVAS : Phaser.AUTO),
    document.getElementById('game'),null,true,false);

game.state.add('Home',Home);
game.state.add('Game',Game);
game.state.start('Home');

/*
= Final TODO list:
* Quick: readme about main functions?
* Put on Github
* Make blog
* About, Share, Source, Credits (indep from Phaser), License, ... [responsively]
 ->Give credit for external tools (phaser-input etc.)
* Setup game analytics (http://www.gameanalytics.com/) and google analytics
*/