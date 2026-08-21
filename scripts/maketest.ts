import { rleEncode } from "../src/game/world.js";
// a hand-"brushed" shape: blocky rectangle (90° corners) + concave bite + peninsula
const W = 26, H = 18;
const c = new Array(W * H).fill(0);
const G = (x:number,y:number)=>{ if(x>=0&&y>=0&&x<W&&y<H) c[y*W+x]=1; };
const E = (x:number,y:number)=>{ if(x>=0&&y>=0&&x<W&&y<H) c[y*W+x]=0; };
// rectangle 6..16 x 4..12  (sharp 90° corners)
for(let y=4;y<=12;y++) for(let x=6;x<=16;x++) G(x,y);
// concave bite out of the bottom edge (erase a notch)
for(let y=10;y<=12;y++) for(let x=10;x<=12;x++) E(x,y);
// a thin peninsula sticking right
for(let y=7;y<=8;y++) for(let x=17;x<=20;x++) G(x,y);
// a 1-tile bump on top
G(11,3); G(12,3);
const now=new Date().toISOString();
const world={version:1,name:"Brush Test",createdAt:now,updatedAt:now,grid:{tile:16,width:W,height:H},
  camera:{cx:W*16/2,cy:H*16/2,scale:3},terrain:{types:["sea","grass","path"],cells:rleEncode(c)},objects:[],sprites:[],regions:[]};
await Bun.write("public/worlds/coast.world.json",JSON.stringify(world));
console.log("wrote brushed-shape test 26x18");
