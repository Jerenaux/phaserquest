/**
 * Created by Jerome on 24-02-17.
 */

function Route(entity,path,departureTime,latency,action,orientation){
    this.id = entity.id;
    this.path = path;
    // need departureTime for update loop and delta for client
    this.departureTime = departureTime;
    this.delta = Math.floor(latency);
    this.action = action;
    this.orientation = orientation;
}

Route.prototype.trim = function(type){
    if(type == 'player') {
        return {
            orientation: this.orientation,
            end: this.path[this.path.length - 1],
            delta: this.delta
        };
    }else if(type == 'monster'){
        return {
            path: this.path,
            delta: this.delta
        };
    }
};

module.exports.Route = Route;