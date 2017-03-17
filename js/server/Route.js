/**
 * Created by Jerome on 24-02-17.
 */

function Route(entity,path,departureTime,latency,action,orientation){
    this.id = entity.id;
    this.path = path;
    // need departureTime for update loop and delta for client
    this.departureTime = departureTime; // timestamp of the start of the movement ; only used for the server
    this.delta = Math.floor(latency); // latency of the player
    this.action = action; // numerical value of the action to perform at the end of the path (used server-side only)
    this.orientation = orientation; // orientation of the player at the end of the path
}

// Strips the Route object to retain only the properties relevant for the clients, before sending it to them
Route.prototype.trim = function(type){
    if(type == 'player') {
        return {
            orientation: this.orientation,
            end: this.path[this.path.length - 1], // when broadcasting player paths, the whole path is not needed, only the endpoint
            delta: this.delta // the latency of the moving player
        };
    }else if(type == 'monster'){
        return {
            path: this.path, // for monsters, the whole path is needed
            delta: this.delta
        };
    }
};

module.exports.Route = Route;