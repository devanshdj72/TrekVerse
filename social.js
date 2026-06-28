// TrekVerse Social Engine — Firestore backend
(function(){
'use strict';
let db=null;
function initDB(){if(db)return db;try{if(typeof firebase!=='undefined'&&firebase.apps.length&&firebase.firestore){db=firebase.firestore();db.enablePersistence({synchronizeTabs:true}).catch(()=>{});return db;}}catch(e){}return null;}
function getUID(){try{return JSON.parse(localStorage.getItem('tv_user')||'{}').uid||null;}catch{return null;}}

window.syncProfileToFirestore=async function(){
  const db=initDB();if(!db)return;
  const uid=getUID();if(!uid)return;
  const auth=JSON.parse(localStorage.getItem('tv_user')||'{}');
  const profile=JSON.parse(localStorage.getItem('trekverse_profile')||'{}');
  const logged_raw=JSON.parse(localStorage.getItem('sl3_logged')||'{}');
  const all_treks=typeof allTreks==='function'?allTreks():[];
  const loggedTreks=all_treks.filter(t=>logged_raw[t.id]);
  let highestTrek=null;
  loggedTreks.forEach(t=>{if(!highestTrek||(t.alt||0)>(highestTrek.alt||0))highestTrek=t;});
  const totalAlt=loggedTreks.reduce((s,t)=>s+(t.alt||0),0);
  const rc={};loggedTreks.forEach(t=>{rc[t.r]=(rc[t.r]||0)+1;});
  const badges=typeof checkAchievements==='function'?checkAchievements({total:Object.keys(logged_raw).length},all_treks).filter(b=>b.earned).map(b=>b.id):[];
  try{await db.collection('users').doc(uid).set({
    uid,name:profile.name||auth.name||'Explorer',photo:profile.photo||auth.photo||null,
    tagline:profile.tagline||'',region:profile.region||'',trekTypes:profile.trekTypes||[],
    stats:{total:Object.keys(logged_raw).length,totalAlt,highestPeak:highestTrek?{name:highestTrek.name,alt:highestTrek.alt}:null,totalDays:loggedTreks.reduce((s,t)=>s+(t.days||0),0)},
    badges,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),isAnon:auth.anon||false,
  },{merge:true});}catch(e){console.warn('[Social]',e);}
};

async function followUser(targetUid){
  const db=initDB();if(!db)return;const myUid=getUID();if(!myUid||myUid===targetUid)return;
  const batch=db.batch();const ts=firebase.firestore.FieldValue.serverTimestamp();
  batch.set(db.collection('users').doc(myUid).collection('following').doc(targetUid),{uid:targetUid,followedAt:ts});
  batch.set(db.collection('users').doc(targetUid).collection('followers').doc(myUid),{uid:myUid,followedAt:ts});
  await batch.commit();
}
async function unfollowUser(targetUid){
  const db=initDB();if(!db)return;const myUid=getUID();if(!myUid)return;
  const batch=db.batch();
  batch.delete(db.collection('users').doc(myUid).collection('following').doc(targetUid));
  batch.delete(db.collection('users').doc(targetUid).collection('followers').doc(myUid));
  await batch.commit();
}
async function isFollowing(targetUid){const db=initDB();if(!db)return false;const myUid=getUID();if(!myUid)return false;const s=await db.collection('users').doc(myUid).collection('following').doc(targetUid).get();return s.exists;}
async function getFollowCounts(uid){const db=initDB();if(!db)return{followers:0,following:0};const[a,b]=await Promise.all([db.collection('users').doc(uid).collection('followers').get(),db.collection('users').doc(uid).collection('following').get()]);return{followers:a.size,following:b.size};}
async function rateProfile(targetUid,stars){
  const db=initDB();if(!db)return;const myUid=getUID();if(!myUid||myUid===targetUid)return;
  const[f,t]=await Promise.all([db.collection('users').doc(myUid).collection('following').doc(targetUid).get(),db.collection('users').doc(targetUid).collection('following').doc(myUid).get()]);
  if(!f.exists||!t.exists)return{error:'Must be mutual followers to rate'};
  await db.collection('users').doc(targetUid).collection('ratings').doc(myUid).set({stars,ratedAt:firebase.firestore.FieldValue.serverTimestamp(),raterUid:myUid});
  const snap=await db.collection('users').doc(targetUid).collection('ratings').get();
  const ratings=snap.docs.map(d=>d.data().stars);
  const avg=ratings.reduce((a,b)=>a+b,0)/ratings.length;
  await db.collection('users').doc(targetUid).set({avgRating:Math.round(avg*10)/10,ratingCount:ratings.length},{merge:true});
  return{avg,count:ratings.length};
}
async function getMyRating(targetUid){const db=initDB();if(!db)return null;const myUid=getUID();if(!myUid)return null;const s=await db.collection('users').doc(targetUid).collection('ratings').doc(myUid).get();return s.exists?s.data().stars:null;}
async function postStory(text,trekName){
  const db=initDB();if(!db)return;const myUid=getUID();if(!myUid)return;
  const auth=JSON.parse(localStorage.getItem('tv_user')||'{}');const profile=JSON.parse(localStorage.getItem('trekverse_profile')||'{}');
  await db.collection('stories').add({authorUid:myUid,authorName:profile.name||auth.name||'Explorer',authorPhoto:profile.photo||auth.photo||null,text,trekName:trekName||'',createdAt:firebase.firestore.FieldValue.serverTimestamp(),likes:[]});
}
async function getFeedStories(){
  const db=initDB();if(!db)return[];const myUid=getUID();if(!myUid)return[];
  const[fSnap,rSnap]=await Promise.all([db.collection('users').doc(myUid).collection('following').get(),db.collection('users').doc(myUid).collection('followers').get()]);
  const fIds=fSnap.docs.map(d=>d.id);const rIds=new Set(rSnap.docs.map(d=>d.id));
  const mutual=fIds.filter(id=>rIds.has(id));
  if(!mutual.length)return[];
  const authors=[...new Set([...mutual,myUid])].slice(0,10);
  const s=await db.collection('stories').where('authorUid','in',authors).orderBy('createdAt','desc').limit(20).get();
  return s.docs.map(d=>({id:d.id,...d.data()}));
}
async function likeStory(storyId){
  const db=initDB();if(!db)return;const myUid=getUID();if(!myUid)return;
  const ref=db.collection('stories').doc(storyId);const snap=await ref.get();if(!snap.exists)return;
  const likes=snap.data().likes||[];
  if(likes.includes(myUid))await ref.update({likes:firebase.firestore.FieldValue.arrayRemove(myUid)});
  else await ref.update({likes:firebase.firestore.FieldValue.arrayUnion(myUid)});
}
async function searchTrekkers(query){
  const db=initDB();if(!db)return[];
  const snap=await db.collection('users').where('isAnon','==',false).limit(30).get();
  let users=snap.docs.map(d=>d.data());
  if(query){const q=query.toLowerCase();users=users.filter(u=>(u.name||'').toLowerCase().includes(q)||(u.tagline||'').toLowerCase().includes(q)||(u.region||'').toLowerCase().includes(q));}
  return users.filter(u=>u.uid!==getUID());
}
async function getUserProfile(uid){const db=initDB();if(!db)return null;const s=await db.collection('users').doc(uid).get();return s.exists?s.data():null;}

window.TrekSocial={init:initDB,syncProfile:window.syncProfileToFirestore,follow:followUser,unfollow:unfollowUser,isFollowing,getFollowCounts,rateProfile,getMyRating,postStory,getFeedStories,likeStory,searchTrekkers,getUserProfile,getUID};

window.addEventListener('load',()=>{const uid=getUID();if(uid&&!JSON.parse(localStorage.getItem('tv_user')||'{}').anon){setTimeout(()=>window.syncProfileToFirestore(),2000);}});
})();
