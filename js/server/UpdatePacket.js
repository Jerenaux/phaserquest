/**
 * Created by Jerome on 26-12-16.
 */

function UpdatePacket(){
    this.newplayers = []; // new player objects to add to the world
    this.newitems = [];
    this.newmonsters = [];
    this.disconnected = []; // list of id's of disconnected players since last update
    this.players = {}; // list of player objects already existing for which properties have been update
    this.items = {};
    this.monsters = {};
}

UpdatePacket.prototype.addObject = function(object){
    var arr;
    switch(object.category){
        case 'player':
            arr = this.newplayers;
            break;
        case 'item':
            arr = this.newitems;
            break;
        case 'monster':
            arr = this.newmonsters;
            break;
    }
    // Check that the object to insert is not already present (possible since when pulling updates from neighboring AOIs)
    for(var i = 0; i < arr.length; i++){
        if(arr[i].id == object.id) return;
    }
    arr.push(object.trim());
};

UpdatePacket.prototype.addDisconnect = function(playerID){
    this.disconnected.push(playerID);
};

UpdatePacket.prototype.updateRoute = function(type,entityID,route){
    var map = (type == 'player' ? this.players : this.monsters);
    if(!map.hasOwnProperty(entityID)) map[entityID] = {};
    map[entityID].route = route;
};

UpdatePacket.prototype.updateProperty = function(type,id,property,value){
    //console.log('updating property type = '+type+', id = '+id+', prop = '+property+', val = '+value);
    var map;
    switch(type){
        case 'item':
            map = this.items;
            break;
        case 'player':
            map = this.players;
            break;
        case 'monster':
            map = this.monsters;
            break;
    }
    if(!map.hasOwnProperty(id)) map[id] = {};
    if(map[id][property] != value) map[id][property] = value;
};

// Remove "echo", i.e. redundant info or info reflected to the player having sent it
UpdatePacket.prototype.removeEcho = function(playerID){
    // The target player of an update package should not receive route info about itself
    if(this.players[playerID]) {
        delete this.players[playerID].route;
        if(Object.keys(this.players[playerID]).length == 0) delete this.players[playerID];
    }
    // Iterate throught the list of newplayer objects
    var i = this.newplayers.length;
    while(i--){
        var n = this.newplayers[i];
        if(n.id == playerID){ // if the newplayer is the target player of the update packet, info is echo, removed
            this.newplayers.splice(i,1);
        }else { // Otherwise, check for redundancies between player and newplayer objects and remove them
            for (var j = 0; j < Object.keys(this.players).length; j++) {
                var key = Object.keys(this.players)[j];
                if (n.id == key) delete this.players[Object.keys(this.players)[j]];
            }
        }
    }
};
// Get updates about all entities present in the list of AOIs
UpdatePacket.prototype.synchronize = function(AOI){
    for(var i = 0; i < AOI.entities.length; i++){
        this.addObject(AOI.entities[i]); // don't send the trimmed version, the trim is done in adObject()
    }
};

UpdatePacket.prototype.isEmpty = function(){
    if(Object.keys(this.players).length > 0) return false;
    if(Object.keys(this.monsters).length > 0) return false;
    if(Object.keys(this.items).length > 0) return false;
    if(this.newplayers.length > 0) return false;
    if(this.newitems.length > 0) return false;
    if(this.newmonsters.length > 0) return false;
    if(this.disconnected.length > 0) return false;
    return true;
};

UpdatePacket.prototype.clean = function(){
    if(!Object.keys(this.players).length) delete this.players;
    if(!Object.keys(this.monsters).length) delete this.monsters;
    if(!Object.keys(this.items).length) delete this.items;
    if(!this.newplayers.length) delete this.newplayers;
    if(!this.newitems.length) delete this.newitems;
    if(!this.newmonsters.length) delete this.newmonsters;
    if(!this.disconnected.length) delete this.disconnected;
    return this;
};

module.exports.UpdatePacket = UpdatePacket;