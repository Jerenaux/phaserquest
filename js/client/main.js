
var game = new Phaser.Game(980, 500,
    (navigator.userAgent.toLowerCase().indexOf('firefox') > -1 ? Phaser.CANVAS : Phaser.AUTO),
    document.getElementById('game'),null,true,false);

game.state.add('Home',Home);
game.state.add('Game',Game);
game.state.start('Home');

