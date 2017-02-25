/**
 * Created by Jerome on 21-10-16.
 */

var Client = {
    eventsQueue : [], // when events arrive before the flag playerIsInitialized is set to true, they are not processed
    // and instead are queued in this array ; they will be processed once the client is initialized and Client.emptyQueue() has been called
    initEventName: 'init', // name of the event that triggers the call to initWorld() and the initialization of the game
    storageNameKey: 'playerName', // key in localStorage of the player name
    storageIDKey: 'playerID' // key in localStorage of player ID
};
Client.socket = io.connect();

// The following checks if the game is initialized or not, and based on this either queues the events or process them
// The original socket.onevent function is copied to onevent. That way, onevent can be used to call the origianl function,
// whereas socket.onevent can be modified for our purpose!
var onevent = Client.socket.onevent;
Client.socket.onevent = function (packet) {
    if(!Game.playerIsInitialized && packet.data[0] != Client.initEventName && packet.data[0] != 'dbError'){
        Client.eventsQueue.push(packet);
    }else{
        onevent.call(this, packet);    // original call
    }
};

Client.emptyQueue = function(){ // Process the events that have been queued during initialization
    for(var e = 0; e < Client.eventsQueue.length; e++){
        onevent.call(Client.socket,Client.eventsQueue[e]);
    }
};

Client.requestData = function(){ // request the data to be used for initWorld()
    Client.socket.emit('init-world',Client.getInitRequest());
};

Client.getInitRequest = function(){ // Returns the data object to send to request the initialization data
    // In case of a new player, set new to true and send the name of the player
    // Else, set new to false and send it's id instead to fetch the corresponding data in the database
    if(Client.isNewPlayer()) return {new:true,name:Client.getName(),clientTime:Date.now()};
    var id = Client.getPlayerID();
    return {new:false,id:id,clientTime:Date.now()};
};

Client.isNewPlayer = function(){
    var id = Client.getPlayerID();
    var name = Client.getName();
    var armor = Client.getArmor();
    var weapon = Client.getWeapon();
    return !(id !== undefined && name && armor && weapon);
};

Client.setLocalData = function(id){ // store the player ID in localStorage
    //console.log('your ID : '+id);
    localStorage.setItem(Client.storageIDKey,id);
};

Client.getPlayerID = function(){
    return localStorage.getItem(Client.storageIDKey);
};

Client.hasAchievement = function(id){
    return (localStorage.getItem('ach'+id)? true : false);
};

Client.setAchievement = function(id){
    localStorage.setItem('ach'+id,true);
};

Client.setArmor = function(key){
    localStorage.setItem('armor',key);
};

Client.getArmor = function(){
    return localStorage.getItem('armor');
};

Client.setWeapon = function(key){
    localStorage.setItem('weapon',key);
};

Client.getWeapon = function(){
    return localStorage.getItem('weapon');
};

Client.setName = function(name){
    localStorage.setItem('name',name);
};

Client.getName = function(){
    return localStorage.getItem('name');
};

Client.socket.on('pid',function(playerID){ // the 'pid' event is used for the server to tell the client what is the ID of the player
    Client.setLocalData(playerID);
});

Client.socket.on(Client.initEventName,function(data){ // This event triggers when receiving the initialization packet from the server, to use in Game.initWorld()
    if(data instanceof ArrayBuffer) data = Decoder.decode(data,CoDec.initializationSchema); // if in binary format, decode first
    Client.socket.emit('ponq',data.stamp); // send back a pong stamp to compute latency
    Game.initWorld(data);
    Game.updateNbConnected(data.nbconnected);
});

Client.socket.on('update',function(data){ // This event triggers uppon receiving an update packet (data)
    if(data instanceof ArrayBuffer) data = Decoder.decode(data,CoDec.finalUpdateSchema); // if in binary format, decode first
    Client.socket.emit('ponq',data.stamp);  // send back a pong stamp to compute latency
    if(data.nbconnected !== undefined) Game.updateNbConnected(data.nbconnected);
    if(data.latency) Game.setLatency(data.latency);
    if(data.global) Game.updateWorld(data.global);
    if(data.local) Game.updateSelf(data.local);
});

Client.socket.on('reset',function(data){
    // If there is a mismatch between client and server coordinates, this event will reset the client to the server coordinates
    // data contains the correct position of the player
    Game.moveCharacter(Game.player.id,data,0,Game.latency);
});

Client.socket.on('dbError',function(){
    // dbError is sent back from the server when the client attempted to connect by sending a player ID that has no match in the database
    localStorage.clear();
    Game.displayError();
});

Client.socket.on('wait',function(){
    // wait is sent back from the server when the client attempts to connect before the server is done initializing and reading the map
    console.log('Server not ready, re-attempting...');
    setTimeout(Client.requestData, 500); // Just try again in 500ms
});

Client.socket.on('chat',function(data){
    // chat is sent by the server when another nearby player has said something
    Game.playerSays(data.id,data.txt);
});

Client.sendPath = function(path,action,finalOrientation){
    // Send the path that the player intends to travel
    Client.socket.emit('path',{
        path:path,
        action:action,
        or:finalOrientation
    });
};

Client.sendChat = function(txt){
    // Send the text that the player wants to say
    if(!txt.length || txt.length > Game.maxChatLength) return;
    Client.socket.emit('chat',txt);
};

Client.sendRevive = function(){
    // Signal the server that the player wants to respawn
    Client.socket.emit('revive');
};

Client.deletePlayer = function(){
    // Signal the server that the player wants to delete his character
    Client.socket.emit('delete',{id:Client.getPlayerID()});
    localStorage.clear();
};