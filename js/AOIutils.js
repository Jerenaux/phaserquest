/**
 * Created by Jerome on 21-01-17.
 */

var AOIutils = {
    nbAOIhorizontal: 0,
    lastAOIid: 0
};


AOIutils.listAdjacentAOIs = function(current){
    var AOIs = [];
    var isAtTop = (current < AOIutils.nbAOIhorizontal);
    var isAtBottom = (current > AOIutils.lastAOIid - AOIutils.nbAOIhorizontal);
    var isAtLeft = (current%AOIutils.nbAOIhorizontal == 0);
    var isAtRight = (current%AOIutils.nbAOIhorizontal == AOIutils.nbAOIhorizontal-1);
    AOIs.push(current);
    if(!isAtTop) AOIs.push(current - AOIutils.nbAOIhorizontal);
    if(!isAtBottom) AOIs.push(current + AOIutils.nbAOIhorizontal);
    if(!isAtLeft) AOIs.push(current-1);
    if(!isAtRight) AOIs.push(current+1);
    if(!isAtTop && !isAtLeft) AOIs.push(current-1-AOIutils.nbAOIhorizontal);
    if(!isAtTop && !isAtRight) AOIs.push(current+1-AOIutils.nbAOIhorizontal);
    if(!isAtBottom && !isAtLeft) AOIs.push(current-1+AOIutils.nbAOIhorizontal);
    if(!isAtBottom && !isAtRight) AOIs.push(current+1+AOIutils.nbAOIhorizontal);
    return AOIs;
};

if (typeof window === 'undefined') module.exports.AOIutils = AOIutils;