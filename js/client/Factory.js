/**
 * Created by Jerome on 28-12-16.
 */

function Factory(create){
    this.graveyard = [];
    this.create = create;
}

Factory.prototype.next = function(x,y,key){
    // Check if a dead sprite lies in the graveyard ; if yes, "refresh" it and return it, else, create a new one using the "create" callback supplied when creating the factory
    for(var g = 0; g < this.graveyard.length; g++){
        if(!this.graveyard[g].alive) return this.setUp(this.graveyard[g],x,y,key);
    }
    return this.create(x,y,key);
};

Factory.prototype.setUp = function(sprite,x,y,key){
    sprite.x = x;
    sprite.y = y;
    sprite.revive();
    return sprite;
};