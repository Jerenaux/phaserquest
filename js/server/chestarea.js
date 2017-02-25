/**
 * Created by Jerome on 08-11-16.
 */

// Object representing a "chest area", that is, an area where a chest spawns if all present monsters are killed
function ChestArea(properties,callback){
    this.actualN = 0; // number of monsters currently in the area
    this.maxN = 0; // total number of monsters normally in the area
    this.properties = properties; // properties such as the coordinates of the chest and its content (read from the Tiled map)
    this.active = true; // an area is active only once all its monsters have respawn. Before then, killing monsters in it won't trigger the chest.
    this.callback = callback;
}

ChestArea.prototype.incrementAll = function(){
    this.actualN++;
    this.maxN++;
};

ChestArea.prototype.increment = function(){
    this.actualN++;
    // Called when a monster respawns; when they have all respawned, the area becomes active again
    if(this.actualN == this.maxN) this.active = true;
};

ChestArea.prototype.decrement = function(){
    this.actualN--;
    if (this.active && this.actualN == 0) { // Spawn the chest when all the monsters of an active area have been cleared
        this.callback(this.properties);
        this.active = false; // Will become active again when all monsters have respawn, not before
    }
};

module.exports.ChestArea = ChestArea;
