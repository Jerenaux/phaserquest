# phaserquest

Phaser Quest is a reproduction of Mozilla's Browserquest (http://browserquest.mozilla.org/) using the following tools:
- The [Phaser](https://phaser.io/) framework for the client 
- [Socket.io](http://socket.io/) and [Node.js](https://nodejs.org/en/) for the server and client-server communication

## Quick tour of the code

### Client side

The game canvas and the game states are created in `js/client/main.js`. The `Home` state is started first, and will display the home page
of the game. The `Game` state is started upon calling `startGame()` from the `Home` state. 

`js/client/game.js` contains the  `Game` object, which corresponds to the `Game` state and contains the bulk of the client code. 
`Game.init()` is automatically called first by Phaser, to initialize a few variables. `Game.preload()` is then called, to load the
assets that haven't been loaded in the `Home` state. When all assets are loaded, Phaser calls `Game.create()` where the basics of the game
are set up. At the end of `Game.create()`, a call is made to `Client.requestData()` (from `js/client/client.js`) to request initialization
data from the server. Upon reception of this data, `Game.initWorld()` is called, which finishes starting the game. The main update loop of the client is ``Game.update()`. 

### Server side

`server.js` is the Node.js server that supports the game. Most of the server-side game logic however is located in `js/server/GameServer.js`.
Every 200ms, `GameServer.updatePlayers()` is called, and sends updates to all clients (if there are updates to send). Client-side, these 
updates are processed by `Game.updateWorld()` and `Game.updateSelf()`. 



