/* Morning Dashboard app. Linked from index.html; bump ?v= there when this changes. */
'use strict';
const WORKER_URL='https://muddy-shadow-1aa7.vaibhavjain-1192.workers.dev';
const FETCH_TIMEOUT=45000;   // default; page loads pass shorter ones
var DIAG={};  // diagnostics collected during fetch

/* Apps Script returns an HTML page (sign-in / error) rather than
   JSON when the deployment is stale or needs re-authorising. That
   shows up as "Unexpected token '<'", which says nothing useful —
   so detect it and report something actionable instead. */
var LAST_SHEET_ERROR='';

/* Pull the readable message out of Google's HTML error page */
function htmlErrorText(html){
  var t=String(html||'').replace(/<(script|style)[\s\S]*?<\/\1>/gi,' ')
    .replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&amp;/g,'&')
    .replace(/\s+/g,' ').trim();
  return t.slice(0,220);
}

async function sheetFetch(url,opts,timeoutMs){
  var ms=timeoutMs||FETCH_TIMEOUT;
  var ctrl=new AbortController();
  var tid=setTimeout(function(){ctrl.abort();},ms);
  LAST_SHEET_ERROR='';          // never report a previous request's error for this one
  try{
    var resp=await fetch(withKey(url),Object.assign({signal:ctrl.signal},opts||{}));
    clearTimeout(tid);
    if(!resp.ok) throw new Error('HTTP '+resp.status);

    var text=await resp.text();
    var head=text.slice(0,300).trim();

    if(head.charAt(0)==='<'){
      var said=htmlErrorText(text);
      LAST_SHEET_ERROR = /sign ?in|accounts\.google/i.test(head)
        ? 'Apps Script is asking for sign-in \u2014 open the script and re-authorise, then Deploy > New version.'
        : 'Apps Script returned an error page'+(said?': \u201c'+said+'\u201d':'')+'.';
      throw new Error(LAST_SHEET_ERROR);
    }

    try{
      var json=JSON.parse(text);
      if(json&&json.status==='locked'){
        LAST_SHEET_ERROR='This dashboard needs its key on this device.';
        onLocked(json.reason||'');
      }
      if(json&&json.status==='error'){
        LAST_SHEET_ERROR='Script error: '+(json.message||'unknown');
        console.warn('[sheetFetch] script reported:',url,json.message);
      }else{
        LAST_SHEET_ERROR='';
      }
      return json;
    }catch(pe){
      LAST_SHEET_ERROR='Unreadable response from Apps Script.';
      throw new Error(LAST_SHEET_ERROR);
    }
  }catch(e){
    clearTimeout(tid);
    if(e&&e.name==='AbortError') LAST_SHEET_ERROR='Timed out after '+Math.round(ms/1000)+'s \u2014 the Sheet was too slow to answer.';
    else if(!LAST_SHEET_ERROR) LAST_SHEET_ERROR=e.message||String(e);
    console.warn('[sheetFetch]',url,LAST_SHEET_ERROR);
    return null;
  }
}

/* POST to Sheet */
async function postToSheet(data){
  try{
    var b=new URLSearchParams(); b.append('payload',JSON.stringify(Object.assign({},data,{key:getDashKey()})));
    var d=await sheetFetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:b.toString()});
    return !!(d&&d.status==='ok');
  }catch(e){return false;}
}

/* GET from Sheet */
async function fetchFromSheet(){
  var d=await sheetFetch(WORKER_URL+'?action=getToday&date='+isoToday());
  return (d&&d.status==='ok')?d:null;
}

var MANTRAS=[
  {text:"You don't have to be perfect. You just have to begin.",src:"-- James Clear"},
  {text:"The mind is the athlete. Everything else follows.",src:"-- David Goggins"},
  {text:"Between stimulus and response there is a space. In that space lies your power.",src:"-- Viktor Frankl"},
  {text:"Control what you can. Release what you cannot.",src:"-- Stoic principle"},
  {text:"Discipline is choosing what you want most over what you want right now.",src:"-- Abraham Lincoln"},
  {text:"Calm is a superpower.",src:"-- Ancient Stoic wisdom"},
  {text:"Today's actions are tomorrow's character.",src:"-- Ryan Holiday"},
  {text:"You are not your thoughts. You are the one who notices them.",src:"-- Mindfulness"},
  {text:"Amor fati -- love everything that happens.",src:"-- Marcus Aurelius"},
  {text:"The obstacle is the way.",src:"-- Marcus Aurelius"},
  {text:"Small disciplines repeated with consistency lead to great achievements.",src:"-- John Maxwell"},
  {text:"Energy flows where attention goes.",src:"-- Tony Robbins"},
  {text:"Hard choices, easy life. Easy choices, hard life.",src:"-- Jerzy Gregorek"},
  {text:"What you do today is what matters most.",src:"-- Jocko Willink"},
  {text:"The best investment you can make is in yourself.",src:"-- Warren Buffett"}
];
var PILLAR_COLORS=['#b0a0d6','#E07B7B','#C9A84C','#6BBF8E','#4ECDC4'];
var PILLARS=[
  {e:'&#129504;',n:'Mental strength',s:'Build a resilient, sharp, unshakeable mind',items:[{t:'Control only what is in your control',d:"Let go of outcomes. Focus entirely on your effort and attitude."},{t:'Embrace discomfort as growth',d:"Every hard moment is a deposit into your future self."},{t:'Reject negative self-talk immediately',d:"Name the thought, step back from it, replace with a neutral fact."},{t:'Focus on process, not results',d:"Show up fully. Results are a byproduct of consistent quality action."},{t:'Think long-term, act present',d:"What can I do right now that serves who I'm becoming in 5 years?"}]},
  {e:'&#10084;&#65039;',n:'Emotional control',s:'Stay regulated and intentional under pressure',items:[{t:'Pause before reacting',d:"Three deep breaths before responding to anything emotionally charged."},{t:"Name the emotion -- don't become it",d:'"I notice I feel frustrated" -- not "I am frustrated."'},{t:'Respond to what is, not what you fear',d:"Stay present. Catastrophising borrows suffering from the future."},{t:'Set the emotional tone first',d:"Your inner state radiates outward. People read energy before words."},{t:'Forgive quickly -- especially yourself',d:"Resentment drains mental RAM. Release it and reclaim the space."}]},
  {e:'&#127919;',n:'Focus & clarity',s:"Protect your attention -- it's your most finite resource",items:[{t:'One task at a time, always',d:"Every task switch costs cognitive energy. Guard your attention."},{t:'Remove friction before you start',d:"Set up your environment the night before. Eliminate morning resistance."},{t:'Kill distractions before they start',d:"Phone away, notifications off. Distraction begins with one ping."},{t:'Time-block your most important work first',d:"Protect 90 minutes before meetings or messages touch you."},{t:'Revisit your goals weekly',d:"What you track, you tend. An unseen goal is a forgotten goal."}]},
  {e:'&#9889;',n:'Body & energy',s:'Your physical state is the foundation everything rests on',items:[{t:'Move before you touch your phone',d:"Even 10 minutes of movement sets a different neurological baseline."},{t:'Hydrate immediately on waking',d:"Your brain is ~75% water. Water before coffee, every day."},{t:'Protect your sleep ruthlessly',d:"No screen 1 hour before bed. Sleep debt destroys emotional regulation."},{t:'Eat to fuel, not to fill',d:"Every meal is a choice about how sharp you'll be in 2 hours."},{t:'Breathe on purpose',d:"Box breathing -- 4 in, hold 4, out 4, hold 4 -- calms you in 2 minutes."}]},
  {e:'&#129306;',n:'Relationships',s:'The quality of your life is the quality of your connections',items:[{t:'Listen more than you speak',d:"Most conflict is a failure to feel heard. Give that gift first."},{t:'Assume positive intent by default',d:"Before attributing malice, consider circumstance."},{t:'Express appreciation specifically',d:"Tell someone one precise thing you value about them today."},{t:'Set boundaries with warmth',d:"Say no to the request and yes to the person."},{t:'Be fully present',d:"Phone away. Eyes up. Half-presence is obvious to them."}]}
];
var CHECKLIST=[
  {t:'Drank water on waking',tag:'body',k:'water'},
  {t:'Moved before checking phone',tag:'body',k:'move'},
  {t:"Set today's intentions",tag:'mind',k:'intentions'},
  {t:'Named my one priority',tag:'focus',k:'priority'},
  {t:'Set emotional intention',tag:'emotion',k:'emotion'},
  {t:'No reactive screen first 30 min',tag:'focus',k:'no_screen'},
  {t:'Said something kind or grateful',tag:'heart',k:'kind'},
  {t:'Took 3 deep breaths intentionally',tag:'body',k:'breathe'}
];
var EMAP={anger:'&#128548;',anxiety:'&#128560;',frustration:'&#128547;',hurt:'&#128148;',shame:'&#128532;',overwhelm:'&#127754;',fear:'&#128552;',jealousy:'&#128065;'};

var activePillar=null,checked={},situations=[],thoughts=[],posts=[];
var selEmotion='',selThCategory='',selThEmotion='',selPostSource='',selPostEmotion='';
var pastEmoFilter='all',thCatFilter='all',thEmoFilter='all',postSrcFilter='all',postEmoFilter='all';

var CAT_ICONS={mindset:'&#129504;',emotion:'&#10084;&#65039;',focus:'&#127919;',discipline:'&#9889;',relationships:'&#129306;',philosophy:'&#128214;',business:'&#128188;',life:'&#127807;'};
var TH_EMO_ICONS={inspired:'&#10024;',calm:'&#129528;',motivated:'&#128293;',grateful:'&#128591;',reflective:'&#129710;',challenged:'&#128170;'};
var POST_SRC_ICONS={linkedin:'&#128188;',instagram:'&#128248;',other:'&#127760;'};
var POST_SRC_LABELS={linkedin:'LinkedIn',instagram:'Instagram',other:'Other'};
var POST_EMO_ICONS={inspired:'&#10024;',motivated:'&#128293;',calm:'&#129528;',grateful:'&#128591;',reflective:'&#129710;',challenged:'&#128170;',joyful:'&#128516;'};

function isoToday(){var d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function isoDate(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function pad(n){return String(n).padStart(2,'0');}
function parseISO(s){if(!s)return null;var p=s.split('-').map(Number);return new Date(p[0],p[1]-1,p[2]);}
function escH(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
var _tt=null;
function showToast(msg,type){var el=document.getElementById('toast');el.textContent=msg;el.className='toast show'+(type?' '+type:'');clearTimeout(_tt);_tt=setTimeout(function(){el.classList.remove('show');},3200);}

function switchTab(tab){
  document.querySelectorAll('.pg').forEach(function(p){p.classList.remove('on');});
  document.querySelectorAll('.tab').forEach(function(b){b.classList.remove('on');});
  document.getElementById('pg-'+tab).classList.add('on');
  var idx=tab==='morning'?0:tab==='routine'?1:tab==='situations'?2:tab==='thoughts'?3:tab==='posts'?4:tab==='motivation'?5:tab==='gratitude'?6:tab==='kundali'?7:8;
  document.querySelectorAll('.tab')[idx].classList.add('on');
  if(tab==='routine'){_calNeedsScroll=true;renderMaster();renderRoutine();}
  if(tab==='situations'){renderStats();renderPast();}
  if(tab==='thoughts')renderThoughts();
  if(tab==='posts')renderPosts();
  if(tab==='motivation')renderMotivation();
  if(tab==='gratitude'){renderGratitude();updateGratStats();}
  if(tab==='kundali')renderKundali();
  if(tab==='guide')renderGuide();
  window.scrollTo({top:0,behavior:'smooth'});
}

function init(){
  try{
    var now=new Date(),h=now.getHours();
    document.getElementById('greeting').textContent=h<12?'Good morning':h<17?'Good afternoon':'Good evening';
    document.getElementById('time-now').textContent=now.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true});
    document.getElementById('date-line').textContent=now.toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
    var day=Math.floor((now-new Date(now.getFullYear(),0,0))/86400000);
    document.getElementById('day-num').textContent=day;
    var m=MANTRAS[day%MANTRAS.length];
    document.getElementById('mantra-text').textContent='\u201C'+m.text+'\u201D';
    document.getElementById('mantra-source').textContent=m.src;
  }catch(e){console.error('Header:',e);}
  // Only load checklist state from localStorage (not synced to Sheet)
  try{
    var stored=getTodayStored();
    if(stored.checked)Object.assign(checked,stored.checked);
    renderChecklist();updateStreak();
    renderPillars();
    renderTodayHabits();
    renderMaster();
    renderRoutine();
    initSections();
  }catch(e){console.error('Local:',e);}

  // Wipe ALL Sheet-synced localStorage keys on every load
  // so stale data from a previous session can never appear
  var SHEET_KEYS=[
    'morning_situations','morning_thoughts','morning_posts',
    'morning_habits','morning_motivation','morning_gratitude','morning_kundali'
  ];
  SHEET_KEYS.forEach(function(k){ localStorage.removeItem(k); });

  // Clear all in-memory arrays — Sheet is always the source of truth
  situations=[]; thoughts=[]; posts=[]; habits=[]; motEntries=[]; gratEntries=[]; kunEntries=[];
  guide=[]; sitPlans=[]; sitLog={};
  habitMaster=[]; habitReasons=[]; routineItems=[]; routineLog={}; routineMiss={}; extraRoutines=[]; routineDay={}; selDate=isoToday();
  updateBadge(); updateThBadge(); updatePostBadge();

  // Show shimmer/loading state on morning intentions
  setIntentionsState('loading');
  renderFeed();
  drLoadSnap();
  renderCalm();
  renderSleep(); renderCheckin(); renderWeekly();

  /* Two-stage load. The core request carries only what Home and
     Routine render, so the page is usable in a fraction of the time;
     the archives that fill the other tabs arrive straight after,
     in the background. A timeout on either falls back to fetching
     collections one at a time. */
  (async function(){
    function applyCore(d){
      if(Array.isArray(d.habitMaster)) replaceHabitMasterFromSheet(d.habitMaster);
      if(Array.isArray(d.habitReasons))replaceHabitReasonsFromSheet(d.habitReasons);
      if(Array.isArray(d.dailyFocus))  replaceDailyFocusFromSheet(d.dailyFocus);
      if(Array.isArray(d.sitPlans))    replaceSitPlansFromSheet(d.sitPlans);
      if(Array.isArray(d.sitLog))      replaceSitLogFromSheet(d.sitLog);
      if(Array.isArray(d.routineItems))replaceRoutineItemsFromSheet(d.routineItems);
      if(Array.isArray(d.todayHabits)) replaceHabitsFromSheet(d.todayHabits);
      if(Array.isArray(d.routineLog))  replaceRoutineLogFromSheet(d.routineLog);
      if(Array.isArray(d.routineDay))  replaceRoutineDayFromSheet(d.routineDay);
      // An older Code.gs doesn't send dailyRules — say so instead of offering a save it would misroute
      if(Array.isArray(d.dailyRules))  replaceDailyRulesFromSheet(d.dailyRules); else markDailyRulesUnsupported();
      // Older Code.gs: no food data. Say so rather than offer saves it would misroute
      if(Array.isArray(d.foodHabits)&&Array.isArray(d.foodTrack)) replaceFoodFromSheet(d.foodHabits, d.foodLog||[], d.foodTrack); else markFoodUnsupported();
      if(Array.isArray(d.ruleChecks)&&Array.isArray(d.dayLog)) replaceCheckinFromSheet(d.ruleChecks, d.dayLog); else markCheckinUnsupported();
      dashKeySet = d.keySet===true ? true : d.keySet===false ? false : null;
      lastBackup = d.lastBackup||'';
      renderKeyWarning();
      if(!selDate) selDate=isoToday();
      activeRoutine=routineForDate(selDate);
      _calNeedsScroll=true;
      renderMaster(); renderRoutine(); renderDailyFocus(); renderPlanLibrary();
    }

    function applyArchives(d){
      if(Array.isArray(d.situations)) replaceSituationsFromSheet(d.situations);
      if(Array.isArray(d.thoughts))   replaceThoughtsFromSheet(d.thoughts);
      if(Array.isArray(d.posts))      replacePostsFromSheet(d.posts);
      if(Array.isArray(d.motivation)) replaceMotivationFromSheet(d.motivation);
      if(Array.isArray(d.gratitude))  replaceGratitudeFromSheet(d.gratitude);
      if(Array.isArray(d.kundali))    replaceKundaliFromSheet(d.kundali);
      if(Array.isArray(d.guide))      replaceGuideFromSheet(d.guide);
      feedReady=true; renderFeed();
      banner();
    }

    function banner(){
      showSyncBanner(true,'Sheet \u2713 '+situations.length+' sit \u00b7 '+thoughts.length+
        ' th \u00b7 '+posts.length+' posts \u00b7 '+motEntries.length+' mot \u00b7 '+
        gratEntries.length+' grat \u00b7 '+kunEntries.length+' kun   (tap for details)');
    }

    async function fallback(skipArchives){
      DIAG.everything='FELL BACK \u2014 fetched section by section';
      var jobs=[
        ['getAllSitPlans','sitPlans',replaceSitPlansFromSheet],
        ['getAllSitLog','sitLog',replaceSitLogFromSheet],
        ['getAllDailyFocus','dailyFocus',replaceDailyFocusFromSheet],
        ['getAllHabitMaster','habitMaster',replaceHabitMasterFromSheet],
        ['getAllRoutineItems','routineItems',replaceRoutineItemsFromSheet],
        ['getAllRoutineLogs','routineLog',replaceRoutineLogFromSheet],
        ['getAllRoutineDays','routineDay',replaceRoutineDayFromSheet],
        ['getAllTodayHabits','todayHabits',replaceHabitsFromSheet],
        ['getAllSituations','situations',replaceSituationsFromSheet],
        ['getAllThoughts','thoughts',replaceThoughtsFromSheet],
        ['getAllPosts','posts',replacePostsFromSheet],
        ['getAllMotivation','motivation',replaceMotivationFromSheet],
        ['getAllGratitude','gratitude',replaceGratitudeFromSheet],
        ['getAllKundali','kundali',replaceKundaliFromSheet],
        ['getAllGuide','guide',replaceGuideFromSheet],
        ['getAllHabitReasons','habitReasons',replaceHabitReasonsFromSheet],
        ['getAllDailyRules','dailyRules',replaceDailyRulesFromSheet],
        ['getAllFoodHabits','foodHabits',function(h){ _foodFb.habits=h; }],
        ['getAllFoodLog','foodLog',function(l){ _foodFb.log=l; }],
        ['getAllFoodTrack','foodTrack',function(t){ _foodFb.track=t; }],
        ['getAllRuleChecks','ruleChecks',function(c){ _ciFb.checks=c; }],
        ['getAllDayLog','dayLog',function(l){ _ciFb.log=l; }]
      ];
      if(skipArchives){
        var arcKeys={situations:1,thoughts:1,posts:1,motivation:1,gratitude:1,kundali:1,guide:1};
        jobs=jobs.filter(function(j){ return !arcKeys[j[1]]; });
      }
      // Four at a time, each shown as soon as it arrives
      var got=0, next=0;
      async function worker(){
        while(next<jobs.length){
          var j=jobs[next++];
          var r=await sheetFetch(WORKER_URL+'?action='+j[0],null,20000);
          if(r&&r.status==='ok'&&Array.isArray(r[j[1]])){ try{ j[2](r[j[1]]); got++; }catch(er){ console.error(er); } }
        }
      }
      await Promise.all([worker(),worker(),worker(),worker()]);
      if(!drLoaded) markDailyRulesFailed();
      if(_foodFb.habits && _foodFb.track) replaceFoodFromSheet(_foodFb.habits,_foodFb.log||[],_foodFb.track);
      if(!foodLoaded) markFoodFailed();
      if(_ciFb.checks && _ciFb.log) replaceCheckinFromSheet(_ciFb.checks,_ciFb.log);
      if(!ciLoaded) markCheckinFailed();
      // Only call the feed loaded if something for it actually arrived
      if(posts.length||motEntries.length||kunEntries.length||guide.length||gratEntries.length) feedReady=true;
      else feedFailed=true;
      renderFeed();
      if(!selDate) selDate=isoToday();
      activeRoutine=routineForDate(selDate);
      renderMaster(); renderRoutine(); renderDailyFocus(); renderPlanLibrary();
      if(got<jobs.length) showSyncBanner(false,'Loaded '+got+' of '+jobs.length+' sections \u2014 tap for details');
      else banner();
    }

    var t0=Date.now();
    try{
      /* Both requests go out together; whichever answers first is shown
         first. Archives no longer wait for the core to finish. */
      var arcApplied=false;
      var arcP=sheetFetch(WORKER_URL+'?action=getArchives',null,40000).then(function(arc){
        if(arc&&arc.status==='ok'){
          try{ applyArchives(arc); arcApplied=true; DIAG.archiveMs=(Date.now()-t0)+'ms'; }
          catch(er){ console.error('[archives apply]',er); }
        }else{ DIAG.archives=LAST_SHEET_ERROR||'failed'; }
        return arc;
      });
      var core=await sheetFetch(WORKER_URL+'?action=getCore&date='+isoToday(),null,30000);
      DIAG.everything = core ? core.status : ('NULL response \u2014 '+(LAST_SHEET_ERROR||'no detail'));
      if(core&&core.status==='locked'){ setIntentionsState('form'); return; }
      if(!core||core.status!=='ok'){
        setIntentionsState('form');
        await arcP;                      // don't refetch what the archives already brought
        await fallback(arcApplied);
        return;
      }

      applyCore(core);
      DIAG.coreMs = (Date.now()-t0)+'ms';
      if(core.morning&&(core.morning.priority||core.morning.emotional_intention)){
        showReadView(core.morning.priority||'',core.morning.emotional_intention||'');
      }else{ setIntentionsState('form'); }
      if(!arcApplied) showSyncBanner(true,'Loaded \u2713 fetching the rest\u2026');

      await arcP;
      if(!arcApplied){
        // Archives failed on their own: fetch just those sections, four at a time
        var arcJobs=[
          ['getAllSituations','situations',replaceSituationsFromSheet],
          ['getAllThoughts','thoughts',replaceThoughtsFromSheet],
          ['getAllPosts','posts',replacePostsFromSheet],
          ['getAllMotivation','motivation',replaceMotivationFromSheet],
          ['getAllGratitude','gratitude',replaceGratitudeFromSheet],
          ['getAllKundali','kundali',replaceKundaliFromSheet],
          ['getAllGuide','guide',replaceGuideFromSheet]
        ], aGot=0, aNext=0;
        async function aWorker(){
          while(aNext<arcJobs.length){
            var j=arcJobs[aNext++];
            var r=await sheetFetch(WORKER_URL+'?action='+j[0],null,20000);
            if(r&&r.status==='ok'&&Array.isArray(r[j[1]])){ try{ j[2](r[j[1]]); aGot++; }catch(er){ console.error(er); } }
          }
        }
        await Promise.all([aWorker(),aWorker(),aWorker(),aWorker()]);
        if(aGot){ feedReady=true; renderFeed(); }
        else { feedFailed=true; renderFeed(); }
        if(aGot<arcJobs.length) showSyncBanner(false,'Loaded '+aGot+' of '+arcJobs.length+' archive sections \u2014 tap for details');
        else banner();
      }
    }catch(err){
      console.error('[init fetch error]',err);
      DIAG.everything='EXCEPTION \u2014 '+(err.message||err);
      setIntentionsState('form');
      try{ await fallback(); }
      catch(e2){ showSyncBanner(false,'\u26a0 Could not reach Google Sheet \u2014 tap for details'); }
    }
  })();
}

function showSyncBanner(ok,msg){
  var el=document.getElementById('sync-banner');
  if(!el)return;
  el.style.display='block';
  el.textContent=msg;
  el.style.cursor='pointer';
  el.onclick=function(){ showDiagnostics(); };
  if(ok){
    el.style.background='rgba(107,191,142,0.08)';
    el.style.border='1px solid rgba(107,191,142,0.25)';
    el.style.color='var(--green)';
    // A successful load needs no permanent real estate; failures stay put
    clearTimeout(el._t);
    el._t=setTimeout(function(){ el.style.display='none'; },5000);
  }else{
    el.style.background='rgba(224,123,123,0.08)';
    el.style.border='1px solid rgba(224,123,123,0.3)';
    el.style.color='var(--rose)';
  }
}

function showDiagnostics(){
  var lines=[
    'Today (browser): '+isoToday(),
    '',
    'Bulk load: '+(DIAG.everything||'not run'),
    'Core fetch: '+(DIAG.coreMs||'–')+'   Archives: '+(DIAG.archiveMs||'–'),
    'Last error: '+(LAST_SHEET_ERROR||'none'),
    '',
    'Gratitude fetch: '+(DIAG.gratRaw||'not run'),
    'Today match: '+(DIAG.gratToday||'not checked'),
    'Dates in Sheet: '+(DIAG.gratDates||'none'),
    '',
    'Motivation fetch: '+(DIAG.motRaw||'not run'),
    '',
    'In memory: '+situations.length+' situations, '+thoughts.length+' thoughts, '+
      posts.length+' posts, '+motEntries.length+' motivation, '+gratEntries.length+' gratitude',
    '',
    'Routine log: '+(DIAG.logRows||'not loaded'),
    'Kundali fetch: '+(DIAG.kunRaw||'not run'),
    'Habits fetch: '+(DIAG.habRaw||'not run'),
    'Habits loaded: '+(DIAG.habLoaded||'none'),
    'Habit sheet sync: '+(DIAG.habSync||'not attempted yet')
  ];
  var html='<pre style="font-family:var(--fm);font-size:11px;color:var(--text-2);white-space:pre-wrap;line-height:1.7;margin:0">'+
    escH(lines.join('\n'))+'</pre>';
  openEditModal('Sheet diagnostics',html,{type:'diag'});
}

function setIntentionsState(s){
  // Intentions were removed from the home page; this is now a no-op.
  var w;
  w=document.getElementById('q-loading-wrap'); if(w) w.style.display=s==='loading'?'block':'none';
  w=document.getElementById('q-form-wrap');    if(w) w.style.display=s==='form'?'block':'none';
  w=document.getElementById('q-read-wrap');    if(w) w.style.display=s==='read'?'block':'none';
}
function showReadView(q1,q2){
  if(!document.getElementById('goal-q1')) return;
  document.getElementById('goal-q1').textContent=q1||'--';
  document.getElementById('goal-q2').textContent=q2||'--';

  document.getElementById('goals-date').textContent=new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short'});
  var lbl=document.getElementById('goals-synced-lbl');lbl.textContent='Synced to Sheet \u2713';lbl.className='goals-synced ok';
  document.getElementById('q1').value=q1||'';document.getElementById('q2').value=q2||'';
  setIntentionsState('read');
}
function editIntentions(){
  if(!document.getElementById('q1')) return;
  document.getElementById('q1').value=document.getElementById('goal-q1').textContent.replace('--','');
  document.getElementById('q2').value=document.getElementById('goal-q2').textContent.replace('--','');
  setIntentionsState('form');document.getElementById('q1').focus();
}
function clearQuestions(){if(!document.getElementById('q1'))return;['q1','q2'].forEach(function(id){document.getElementById(id).value='';});document.getElementById('save-status').textContent='';}

async function saveToSheet(){
  if(!document.getElementById('q1')) return;
  var q1=document.getElementById('q1').value.trim(),q2=document.getElementById('q2').value.trim();
  if(!q1&&!q2){showToast('Fill in at least one intention first.','error');return;}
  setSt('Saving...',null);
  var now=new Date();
  var ok=await postToSheet({sheet:'Morning Reflections',
    date:now.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}),
    dateISO:isoDate(now),
    time:now.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true}),
    priority:q1, emotional_intention:q2, gratitude:'',
    checklist_done:CHECKLIST.filter(function(i){return checked[i.k];}).map(function(i){return i.t;}).join(' | '),
    score:CHECKLIST.filter(function(i){return checked[i.k];}).length+'/'+CHECKLIST.length
  });
  saveTodayLocal({checked:checked});
  if(ok){setSt('Saved ✓',true);showToast('Intentions saved to Sheet ✓','success');showReadView(q1,q2);}
  else{setSt('Network error -- please retry.',false);showToast('Could not reach Sheet.','error');}
}
function setSt(msg,ok){var el=document.getElementById('save-status');el.textContent=msg;el.className='save-st'+(ok===true?' ok':ok===false?' err':'');}

function renderPillars(){
  var wrap=document.getElementById('pillars-wrap'); if(!wrap) return;
  wrap.innerHTML=PILLARS.map(function(p,i){
    var col=PILLAR_COLORS[i]||'var(--gold)';
    var open=activePillar===i;
    return '<div class="pil'+(open?' on':'')+'" style="--pc:'+col+'">'+
      '<div class="pil-hd" onclick="togglePillar('+i+')">'+
        '<span class="pil-e">'+p.e+'</span>'+
        '<div class="pil-txt"><div class="pil-n">'+p.n+'</div><div class="pil-s">'+p.s+'</div></div>'+
        '<span class="pil-cnt">'+p.items.length+'</span>'+
        '<span class="pil-arr">&#9662;</span>'+
      '</div>'+
      '<div class="pil-body">'+
        p.items.map(function(it,j){
          return '<div class="pil-item">'+
            '<div class="pil-num">'+(j+1)+'</div>'+
            '<div><div class="pil-t">'+it.t+'</div><div class="pil-d">'+it.d+'</div></div>'+
          '</div>';
        }).join('')+
      '</div>'+
    '</div>';
  }).join('');
}

function togglePillar(id){
  activePillar = (activePillar===id) ? null : id;
  renderPillars();
}


function renderChecklist(){
  var el=document.getElementById('cl-list');el.innerHTML='';
  CHECKLIST.forEach(function(item){var done=!!checked[item.k],div=document.createElement('div');div.className='cl-row'+(done?' done':'');div.onclick=function(){toggleCheck(item.k);};div.innerHTML='<div class="cl-box"><span class="cl-tick">\u2713</span></div><div class="cl-txt">'+item.t+'</div><span class="cl-tag">'+item.tag+'</span>';el.appendChild(div);});updateProg();
}
function toggleCheck(k){checked[k]=!checked[k];saveTodayLocal({checked:checked});renderChecklist();}
function updateProg(){
  var done=CHECKLIST.filter(function(i){return checked[i.k];}).length;
  var t=document.getElementById('prog-txt'); if(t) t.textContent=done+'/'+CHECKLIST.length;

  var f=document.getElementById('prog-fill');if(f) f.style.width=Math.round(done/CHECKLIST.length*100)+'%';
  if(window.updateSectionBadges) updateSectionBadges();
}

function toggleChecklist(){ toggleSection('checklist'); }   // kept for compatibility

function todayKey(){var d=new Date();return 'morning_'+d.getFullYear()+'_'+(d.getMonth()+1)+'_'+d.getDate();}
function getTodayStored(){try{var r=localStorage.getItem(todayKey());return r?JSON.parse(r):{};}catch(e){return{};}}
function saveTodayLocal(extra){var s=getTodayStored();Object.assign(s,{dateISO:isoToday()},extra||{});localStorage.setItem(todayKey(),JSON.stringify(s));updateStreak();}
function resetDay(){if(!confirm("Reset today's progress?"))return;CHECKLIST.forEach(function(i){checked[i.k]=false;});saveTodayLocal({checked:checked});clearQuestions();setIntentionsState('form');renderChecklist();showToast('Day reset. Fresh start.');}
function updateStreak(){var s=0,today=new Date();for(var i=0;i<365;i++){var d=new Date(today);d.setDate(today.getDate()-i);var raw=localStorage.getItem('morning_'+d.getFullYear()+'_'+(d.getMonth()+1)+'_'+d.getDate());if(!raw)break;try{var dd=JSON.parse(raw);if(CHECKLIST.filter(function(x){return dd.checked&&dd.checked[x.k];}).length>0)s++;else if(i>0)break;}catch(e){break;}}document.getElementById('streak-txt').textContent=s>1?'&#128293; '+s+'-day streak -- keep going.':s===1?'&#11088; First step today.':'Start your first practice today.';}

/* SITUATIONS */
function loadSituations(){try{var r=localStorage.getItem('morning_situations');if(r)situations=JSON.parse(r);}catch(e){situations=[];}}
function saveSits(){localStorage.setItem('morning_situations',JSON.stringify(situations));}
function setBadge(id,n){
  var el=document.getElementById(id); if(!el) return;
  el.textContent=n;
  el.classList.toggle('zero',!n);
}
function updateBadge(){ setBadge('sit-badge',situations.length); }
function selEmo(el){document.querySelectorAll('.ep').forEach(function(p){p.classList.remove('on');});selEmotion=(selEmotion===el.dataset.val)?'':el.dataset.val;if(selEmotion)el.classList.add('on');}
function setSyncTxt(state,msg){var el=document.getElementById('sit-sync');el.className='sync-txt '+state;el.textContent=msg;}
async function addSituation(){
  var title=document.getElementById('sit-title').value.trim();if(!title){showToast('Describe the situation first.','error');return;}
  var now=new Date();var sit={id:Date.now(),timestamp:Date.now(),dateISO:isoDate(now),date:now.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}),title:title,trigger:document.getElementById('sit-trigger').value.trim(),reaction:document.getElementById('sit-reaction').value.trim(),emotion:selEmotion,strategy:''};
  situations.unshift(sit);saveSits();updateBadge();
  document.getElementById('sit-title').value='';setTimeout(renderSitMatch,0);document.getElementById('sit-trigger').value='';document.getElementById('sit-reaction').value='';selEmotion='';document.querySelectorAll('.ep').forEach(function(p){p.classList.remove('on');});
  setSyncTxt('syncing','Syncing...');
  var ok=await postToSheet({sheet:'Situations',date:sit.date,dateISO:sit.dateISO,title:sit.title,trigger:sit.trigger,reaction:sit.reaction,emotion:sit.emotion,strategy:''});
  setSyncTxt(ok?'ok':'err',ok?'Synced to Sheet \u2713':'Saved locally (Sheet unreachable)');
  showToast(ok?'Situation logged \u2713':'Saved locally -- sync failed.',ok?'success':'error');
}
function sitCardHTML(s){
  var badge=s.emotion?'<span class="emo-badge">'+(EMAP[s.emotion]||'')+' '+s.emotion+'</span>':'';
  var sb=s.strategy?'<span class="strat-badge">\u2713 strategy</span>':'';
  return '<div class="sc" id="sc-'+s.id+'"><div class="sc-head" onclick="togSC('+s.id+')">' +
    ptTile((s.title||'')+' '+(s.emotion||''),s.trigger,{clearOnly:true})+
    '<div class="sc-meta"><div class="sc-title">'+escH(s.title)+'</div><div class="sc-sub">'+s.date+badge+sb+'</div></div>' +
    '<div class="sc-tog">\u25be</div></div><div class="sc-body">' +
    (s.trigger?'<div class="sb-sec"><div class="sb-lbl">Trigger</div><div class="sb-txt">'+escH(s.trigger)+'</div></div>':'')+
    (s.reaction?'<div class="sb-sec"><div class="sb-lbl">My response</div><div class="sb-txt">'+escH(s.reaction)+'</div></div>':'')+
    '<div class="sb-sec"><div class="sb-lbl">Better ways to handle this</div><textarea class="strat-area" id="str-'+s.id+'" rows="3" placeholder="Scripts, reframes, techniques for next time...">'+escH(s.strategy)+'</textarea>' +
    '<div class="sc-foot"><button class="del-btn" onclick="delSit('+s.id+')">&#128465; Delete</button>' +
    '<div style="display:flex;gap:6px"><button class="btn" style="font-size:11px;padding:5px 12px" onclick="editSituation('+s.id+')">\u270f Edit</button>' +
    '<button class="btn teal" style="font-size:11px;padding:5px 12px" onclick="saveSt('+s.id+')">Save strategy \u2713</button></div></div></div></div></div>';
}
function togSC(id){var c=document.getElementById('sc-'+id);if(c)c.classList.toggle('open');}
async function saveSt(id){var area=document.getElementById('str-'+id);if(!area)return;var sit=situations.find(function(s){return s.id===id;});if(!sit)return;sit.strategy=area.value.trim();saveSits();await postToSheet({sheet:'Situations',action:'update_strategy',dateISO:sit.dateISO,title:sit.title,strategy:sit.strategy});renderPast();setTimeout(function(){var c=document.getElementById('sc-'+id);if(c)c.classList.add('open');},30);showToast('Strategy saved \u2713','success');}
function delSit(id){if(!confirm('Delete this situation?'))return;situations=situations.filter(function(s){return s.id!==id;});saveSits();updateBadge();renderStats();renderPast();showToast('Deleted.','');}
async function fetchAllSituations(){
  var d=await sheetFetch(WORKER_URL+'?action=getAllSituations');
  if(d&&d.status==='ok'&&Array.isArray(d.situations)) replaceSituationsFromSheet(d.situations);
  else console.warn('[Situations] bad response:',d);
}
function replaceSituationsFromSheet(s){
  localStorage.removeItem('morning_situations');
  situations=s.map(function(x,i){return{id:Date.now()+i,timestamp:x.dateISO?new Date(x.dateISO).getTime():Date.now(),dateISO:x.dateISO||'',date:x.date||'',title:x.title||'',trigger:x.trigger||'',reaction:x.reaction||'',emotion:x.emotion||'',strategy:x.strategy||''};});situations.sort(function(a,b){return b.timestamp-a.timestamp;});updateBadge();if(document.getElementById('pg-situations').classList.contains('on')){renderStats();renderPast();}}

/* PAST SITUATIONS TAB */
function renderStats(){var total=situations.length,ws=situations.filter(function(s){return s.strategy;}).length;document.getElementById('st-total').textContent=total;document.getElementById('st-strat').textContent=ws;document.getElementById('st-pend').textContent=total-ws;var freq={};situations.forEach(function(s){if(s.emotion)freq[s.emotion]=(freq[s.emotion]||0)+1;});var top=Object.entries(freq).sort(function(a,b){return b[1]-a[1];})[0];document.getElementById('st-emo').textContent=top?(EMAP[top[0]]||'')+' '+top[0]:'--';}
function setRange(el,r){document.querySelectorAll('.dq').forEach(function(b){b.classList.remove('on');});el.classList.add('on');var now=new Date(),f=document.getElementById('date-from'),t=document.getElementById('date-to');t.value=isoDate(now);if(r==='all'){f.value='';t.value='';}else if(r==='today'){f.value=isoDate(now);}else if(r==='week'){var d=new Date(now);d.setDate(d.getDate()-6);f.value=isoDate(d);}else if(r==='month'){var d=new Date(now);d.setDate(d.getDate()-29);f.value=isoDate(d);}else if(r==='3m'){var d=new Date(now);d.setDate(d.getDate()-89);f.value=isoDate(d);}renderPast();}
function clearDateFilter(){document.getElementById('date-from').value='';document.getElementById('date-to').value='';document.querySelectorAll('.dq').forEach(function(b){b.classList.remove('on');});document.querySelector('.dq[data-r="all"]').classList.add('on');renderPast();}
function setEmoFilter(el){document.querySelectorAll('.ef').forEach(function(p){p.classList.remove('on');});el.classList.add('on');pastEmoFilter=el.dataset.f;renderPast();}
function renderPast(){
  var search=(document.getElementById('psearch').value||'').toLowerCase().trim(),sort=document.getElementById('psort').value;
  var fv=document.getElementById('date-from').value,tv=document.getElementById('date-to').value;
  var fd=fv?parseISO(fv):null,td=tv?parseISO(tv):null;if(td)td.setHours(23,59,59);
  var list=situations.slice();
  if(fd||td)list=list.filter(function(s){var d=s.dateISO?parseISO(s.dateISO):null;if(!d)return true;if(fd&&d<fd)return false;if(td&&d>td)return false;return true;});
  if(pastEmoFilter!=='all')list=list.filter(function(s){return s.emotion===pastEmoFilter;});
  if(search)list=list.filter(function(s){return(s.title+s.trigger+s.reaction+s.strategy).toLowerCase().includes(search);});
  if(sort==='oldest')list.sort(function(a,b){return a.timestamp-b.timestamp;});else if(sort==='newest')list.sort(function(a,b){return b.timestamp-a.timestamp;});else if(sort==='no-strat')list.sort(function(a,b){return(a.strategy?1:0)-(b.strategy?1:0);});else if(sort==='has-strat')list.sort(function(a,b){return(b.strategy?1:0)-(a.strategy?1:0);});
  document.getElementById('pmeta').textContent=list.length+' of '+situations.length+' situation'+(situations.length!==1?'s':'');
  var log=document.getElementById('past-log');
  if(!list.length){log.innerHTML='<div class="sit-empty">'+(situations.length===0?'Nothing logged yet.<br><br><button class="btn" onclick="switchTab(\'situations\')">Go to situations</button>':'No matches for the current filter.')+'</div>';return;}
  log.innerHTML=list.map(sitCardHTML).join('');
}
function exportCSV(){if(!situations.length){showToast('Nothing to export yet.','error');return;}var h=['Date','Situation','Trigger','Reaction','Emotion','Strategy'];var rows=situations.map(function(s){return[s.date,s.title,s.trigger||'',s.reaction||'',s.emotion||'',s.strategy||''].map(function(v){return'"'+String(v).replace(/"/g,'""')+'"';}).join(',');});var a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent([h.join(',')].concat(rows).join('\n'));a.download='situations-'+isoToday()+'.csv';a.click();showToast('CSV exported \u2713','success');}

/* THOUGHTS */
function loadThoughts(){try{var r=localStorage.getItem('morning_thoughts');if(r)thoughts=JSON.parse(r);}catch(e){thoughts=[];}}
function saveThoughts(){localStorage.setItem('morning_thoughts',JSON.stringify(thoughts));}
function updateThBadge(){ setBadge('th-badge',thoughts.length); }
function selThCat(el){document.querySelectorAll('#th-cat-pills .thp').forEach(function(p){p.classList.remove('on');});selThCategory=(selThCategory===el.dataset.val)?'':el.dataset.val;if(selThCategory)el.classList.add('on');}
function selThEmo(el){document.querySelectorAll('#th-emo-pills .thp').forEach(function(p){p.classList.remove('on');});selThEmotion=(selThEmotion===el.dataset.val)?'':el.dataset.val;if(selThEmotion)el.classList.add('on');}
function setThCatFilter(el){document.querySelectorAll('#th-cat-filter .ef').forEach(function(p){p.classList.remove('on');});el.classList.add('on');thCatFilter=el.dataset.c;renderThoughts();}
function setThEmoFilter(el){document.querySelectorAll('#th-emo-filter .ef').forEach(function(p){p.classList.remove('on');});el.classList.add('on');thEmoFilter=el.dataset.e;renderThoughts();}
async function addThought(){
  var heading=document.getElementById('th-heading').value.trim(),text=document.getElementById('th-text').value.trim();
  if(!heading&&!text){showToast('Add a heading or description first.','error');return;}
  var now=new Date(),thId=String(Date.now());
  var th={id:Date.now(),timestamp:Date.now(),sheetId:thId,dateISO:isoDate(now),date:now.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}),heading:heading,text:text,url:document.getElementById('th-url').value.trim(),category:selThCategory,emotion:selThEmotion};
  thoughts.unshift(th);saveThoughts();updateThBadge();
  document.getElementById('th-heading').value='';document.getElementById('th-text').value='';document.getElementById('th-url').value='';selThCategory='';selThEmotion='';
  document.querySelectorAll('#th-cat-pills .thp, #th-emo-pills .thp').forEach(function(p){p.classList.remove('on');});
  document.getElementById('th-sync').textContent='Syncing...';document.getElementById('th-sync').className='sync-txt syncing';
  var ok=await postToSheet({sheet:'Thoughts',sheetId:thId,date:th.date,dateISO:th.dateISO,heading:th.heading,text:th.text,url:th.url,category:th.category,emotion:th.emotion});
  document.getElementById('th-sync').textContent=ok?'Synced to Sheet \u2713':'Saved locally (Sheet unreachable)';
  document.getElementById('th-sync').className='sync-txt '+(ok?'ok':'err');
  showToast(ok?'Thought saved \u2713':'Saved locally -- sync failed.',ok?'success':'error');
  renderThoughts();
}
function renderBullets(text){if(!text)return '';var ls=text.split('\n'),html='',inList=false;ls.forEach(function(line){var tr=line.trim(),bullet=tr.length>0&&(tr[0]==='\u2022'||tr[0]==='-'||tr[0]==='*');if(bullet){if(!inList){html+='<ul class="th-bullets">';inList=true;}html+='<li>'+escH(tr.slice(1).trim())+'</li>';}else{if(inList){html+='</ul>';inList=false;}if(tr)html+='<p class="th-para">'+escH(tr)+'</p>';}});if(inList)html+='</ul>';return html;}
function thoughtCardHTML(t){
  var catBadge=t.category?'<span class="th-cat-badge">'+(CAT_ICONS[t.category]||'')+' '+t.category+'</span>':'';
  var emoBadge=t.emotion?'<span class="th-emo-badge">'+(TH_EMO_ICONS[t.emotion]||'')+' '+t.emotion+'</span>':'';
  var urlHtml=t.url?(t.url.startsWith('http')?'<a class="th-url" href="'+escH(t.url)+'" target="_blank" rel="noopener">&#128279; '+escH(t.url)+'</a>':'<span class="th-url" style="cursor:default;color:var(--text-2)">&#128218; '+escH(t.url)+'</span>'):'';
  var bodyHtml=renderBullets(t.text||'');
  var thTile=t.heading?ptTile(t.heading,t.text,{clearOnly:true,size:'md'}):'';
  return '<div class="th-card">'+(t.heading?(thTile?'<div class="pt-row mid">'+thTile+'<div class="th-card-heading pt-fill">'+escH(t.heading)+'</div></div>':'<div class="th-card-heading">'+escH(t.heading)+'</div>'):'')+(bodyHtml?'<div class="th-card-body">'+bodyHtml+'</div>':'')+'<div class="th-card-meta">'+catBadge+emoBadge+'<span class="th-date">'+t.date+'</span></div>'+(urlHtml?'<div style="margin-top:6px">'+urlHtml+'</div>':'')+'<div class="th-card-foot"><button class="del-btn" onclick="delThought('+t.id+')">&#128465; Delete</button><button class="btn" style="font-size:11px;padding:4px 12px" onclick="editThought('+t.id+')">\u270f Edit</button></div></div>';
}
function renderThoughts(){
  var search=(document.getElementById('th-search').value||'').toLowerCase().trim(),sort=document.getElementById('th-sort').value;
  var list=thoughts.slice();
  if(thCatFilter!=='all')list=list.filter(function(t){return t.category===thCatFilter;});
  if(thEmoFilter!=='all')list=list.filter(function(t){return t.emotion===thEmoFilter;});
  if(search)list=list.filter(function(t){return((t.heading||'')+t.text+(t.url||'')+t.category+t.emotion).toLowerCase().includes(search);});
  if(sort==='oldest')list.sort(function(a,b){return a.timestamp-b.timestamp;});else list.sort(function(a,b){return b.timestamp-a.timestamp;});
  document.getElementById('th-meta').textContent=list.length+' of '+thoughts.length+' thought'+(thoughts.length!==1?'s':'');
  var log=document.getElementById('th-log');
  if(!list.length){log.innerHTML='<div class="sit-empty"><div style="font-size:28px;margin-bottom:10px">&#128161;</div>'+(thoughts.length===0?'No thoughts yet.<br>Add the first insight that moved you.':'No matches for the current filter.')+'</div>';return;}
  log.innerHTML=list.map(thoughtCardHTML).join('');
}
function delThought(id){if(!confirm('Delete this thought?'))return;thoughts=thoughts.filter(function(t){return t.id!==id;});saveThoughts();updateThBadge();renderThoughts();showToast('Deleted.','');}
function exportThoughtsCSV(){if(!thoughts.length){showToast('Nothing to export.','error');return;}var h=['Date','Heading','Description','URL','Category','Emotion'];var rows=thoughts.map(function(t){return[t.date,t.heading||'',t.text||'',t.url||'',t.category||'',t.emotion||''].map(function(v){return'"'+String(v).replace(/"/g,'""')+'"';}).join(',');});var a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent([h.join(',')].concat(rows).join('\n'));a.download='thoughts-'+isoToday()+'.csv';a.click();showToast('CSV exported \u2713','success');}
async function fetchAllThoughts(){
  var d=await sheetFetch(WORKER_URL+'?action=getAllThoughts');
  if(d&&d.status==='ok'&&Array.isArray(d.thoughts)) replaceThoughtsFromSheet(d.thoughts);
  else console.warn('[Thoughts] bad response:',d);
}
function replaceThoughtsFromSheet(s){
  localStorage.removeItem('morning_thoughts');
  var fromSheet=s.map(function(x,i){return{id:x.sheetId?parseInt(x.sheetId,10):Date.now()+i,timestamp:x.dateISO?new Date(x.dateISO).getTime():Date.now(),dateISO:x.dateISO||'',date:x.date||'',heading:x.heading||'',text:x.text||'',url:x.url||'',category:x.category||'',emotion:x.emotion||'',sheetId:x.sheetId||''};});var sheetIds={};s.forEach(function(x){if(x.sheetId)sheetIds[x.sheetId]=true;});var pending=thoughts.filter(function(t){return t.sheetId&&!sheetIds[t.sheetId];});thoughts=fromSheet.concat(pending);thoughts.sort(function(a,b){return b.timestamp-a.timestamp;});updateThBadge();if(document.getElementById('pg-thoughts').classList.contains('on'))renderThoughts();}

/* ═══════════════════════════════════════════════════
   POSTS — Sheet-sourced, with Pinned / All views

   Emotion is free-form: the dropdown offers every emotion ever
   used on a post, plus a handful of starters, plus "add new".
   A new emotion becomes available to every post the moment it
   is saved on one — no separate list to maintain.
═══════════════════════════════════════════════════ */
var postView='pinned';                 // 'all' | 'pinned'
var POST_EMO_STARTERS=['inspired','motivated','calm','grateful','reflective','challenged','joyful'];

function loadPosts(){ posts=[]; }    // Sheet is the source of truth
function savePosts(){}               // nothing cached locally
function updatePostBadge(){ setBadge('post-badge',posts.length); }

/* Every emotion in use across posts, starters first-seen, then the rest A–Z */
function postEmotions(){
  var seen={}, out=[];
  POST_EMO_STARTERS.forEach(function(e){ seen[e.toLowerCase()]=1; out.push(e); });
  var extra=[];
  posts.forEach(function(p){
    var e=(p.emotion||'').trim(); if(!e) return;
    if(!seen[e.toLowerCase()]){ seen[e.toLowerCase()]=1; extra.push(e); }
  });
  extra.sort(function(a,b){ return a.localeCompare(b); });
  return out.concat(extra);
}

function emoLabel(e){
  if(!e) return '';
  var ic=POST_EMO_ICONS[e.toLowerCase()]||'';
  return (ic?ic+' ':'')+e.charAt(0).toUpperCase()+e.slice(1);
}

/* <option>s for an emotion <select>, with the current value selected */
function emoOptionsHTML(cur, placeholder){
  var list=postEmotions();
  if(cur && list.map(function(x){return x.toLowerCase();}).indexOf(cur.toLowerCase())===-1) list=[cur].concat(list);
  return '<option value="">'+escH(placeholder||'No emotion')+'</option>'+
    list.map(function(e){
      var on = cur && e.toLowerCase()===cur.toLowerCase();
      return '<option value="'+escH(e)+'"'+(on?' selected':'')+'>'+emoLabel(e)+'</option>';
    }).join('')+
    '<option value="__new">+ Add a new emotion\u2026</option>';
}

/* Resolves the "__new" choice to a real value, or '' if cancelled */
function resolveEmoPick(sel){
  if(sel.value!=='__new') return sel.value;
  var e=prompt('New emotion:');
  if(!e||!e.trim()) return null;       // cancelled
  return e.trim();
}

function refreshNewPostEmo(){
  var sel=document.getElementById('post-emo-new'); if(!sel) return;
  var cur=sel.value&&sel.value!=='__new'?sel.value:'';
  sel.innerHTML=emoOptionsHTML(cur,'Choose an emotion');
}

function newPostEmoPick(sel){
  var v=resolveEmoPick(sel);
  if(v===null){ refreshNewPostEmo(); return; }
  sel.innerHTML=emoOptionsHTML(v,'Choose an emotion');
}

function selPostSrc(src){selPostSource=(selPostSource===src)?'':src;['li','ig','ot'].forEach(function(s){var el=document.getElementById('src-'+s);if(el)el.className='src-pill';});if(selPostSource){var el=document.getElementById('src-'+selPostSource.substring(0,2));if(el)el.className='src-pill on-'+selPostSource.substring(0,2);}}
function setPostSrcFilter(el){document.querySelectorAll('.post-src-filter-bar .pef').forEach(function(p){p.classList.remove('on');});el.classList.add('on');postSrcFilter=el.dataset.ps;renderPosts();}
function setPostEmoFilter(el){document.querySelectorAll('#post-emo-filter .pef').forEach(function(p){p.classList.remove('on');});el.classList.add('on');postEmoFilter=el.dataset.pe;renderPosts();}

function setPostView(v){
  postView=v;
  document.getElementById('pst-tab-pinned').classList.toggle('on',v==='pinned');
  document.getElementById('pst-tab-all').classList.toggle('on',v==='all');
  renderPosts();
}

/* The emotion filter is built from emotions actually in use */
function renderPostEmoFilter(){
  var el=document.getElementById('post-emo-filter'); if(!el) return;
  var used={};
  posts.forEach(function(p){ if(p.emotion) used[p.emotion.toLowerCase()]=p.emotion; });
  var keys=Object.keys(used).sort();
  if(postEmoFilter!=='all' && !used[postEmoFilter.toLowerCase()]) postEmoFilter='all';
  el.innerHTML='<button class="pef'+(postEmoFilter==='all'?' on':'')+'" data-pe="all" onclick="setPostEmoFilter(this)">All emotions</button>'+
    keys.map(function(k){
      var e=used[k];
      return '<button class="pef'+(postEmoFilter.toLowerCase()===k?' on':'')+'" data-pe="'+escH(e)+'" onclick="setPostEmoFilter(this)">'+emoLabel(e)+'</button>';
    }).join('');
  el.style.display = keys.length ? '' : 'none';
}

async function addPost(){
  var heading=document.getElementById('post-heading').value.trim(),desc=document.getElementById('post-desc').value.trim();
  if(!heading&&!desc){showToast('Add a heading or description first.','error');return;}
  var emoSel=document.getElementById('post-emo-new');
  var emotion=(emoSel&&emoSel.value&&emoSel.value!=='__new')?emoSel.value:'';
  var pinned=document.getElementById('post-pin-new').checked;
  var now=new Date(),pid=String(Date.now());
  var post={id:Date.now(),timestamp:Date.now(),sheetId:pid,dateISO:isoDate(now),
    date:now.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}),
    heading:heading,desc:desc,source:selPostSource,url:document.getElementById('post-url').value.trim(),
    emotion:emotion,pinned:pinned,images:document.getElementById('post-imgs').value.trim()};
  posts.unshift(post);updatePostBadge();

  document.getElementById('post-heading').value='';document.getElementById('post-desc').value='';
  document.getElementById('post-url').value='';document.getElementById('post-imgs').value='';document.getElementById('post-pin-new').checked=false;
  renderUploadThumbs('post-imgs','up-thumbs-new');
  var upp=document.getElementById('up-prog-new'); if(upp){upp.textContent='';upp.className='up-prog';}
  selPostSource='';
  ['li','ig','ot'].forEach(function(s){var el=document.getElementById('src-'+s);if(el)el.className='src-pill';});
  refreshNewPostEmo(); if(emoSel) emoSel.value='';
  renderPosts();

  var syncEl=document.getElementById('post-sync');syncEl.textContent='Syncing...';syncEl.className='sync-txt syncing';
  var ok=await postToSheet({sheet:'Posts',sheetId:pid,date:post.date,dateISO:post.dateISO,heading:post.heading,
    desc:post.desc,source:post.source,url:post.url,emotion:post.emotion,pinned:pinned?'yes':'no',images:post.images});
  syncEl.textContent=ok?'Synced to Sheet \u2713':'Sheet sync failed';syncEl.className='sync-txt '+(ok?'ok':'err');
  showToast(ok?'Post saved \u2713':'Sync failed \u2014 post not saved to Sheet.',ok?'success':'error');
}

/* Stored one image per line as "fullUrl|thumbUrl". Rows saved
   before thumbs existed are plain URLs, so the thumb falls back
   to the full URL. Only http(s) links are accepted. */
function parseImgs(s){
  return String(s||'').split(/\n/).map(function(line){
    var parts=line.split('|').map(function(x){ return x.trim(); });
    var url=parts[0]||'', thumb=parts[1]||parts[0]||'';
    if(!/^https?:\/\//i.test(url)) return null;
    return {url:url, thumb:/^https?:\/\//i.test(thumb)?thumb:url};
  }).filter(Boolean);
}

function openLightbox(url){
  var lb=document.getElementById('lightbox');
  document.getElementById('lightbox-img').src=url;
  lb.classList.add('on');
}

function postCardHTML(p){
  var sc=p.source==='linkedin'?'li':p.source==='instagram'?'ig':'ot';
  var srcBadge=p.source?'<span class="post-src-badge post-src-'+sc+'">'+(POST_SRC_ICONS[p.source]||'')+' '+(POST_SRC_LABELS[p.source]||p.source)+'</span>':'';
  var bodyHtml=renderBullets(p.desc||'');
  var urlHtml=p.url?'<a class="post-url" href="'+escH(p.url)+'" target="_blank" rel="noopener">&#128279; '+escH(p.url)+'</a>':'';
  return '<div class="post-card'+(p.pinned?' pinned':'')+'">'+
    '<div class="pst-card-top">'+
      (p.heading?'<div class="pt-row mid" style="flex:1;min-width:0">'+ptTile(p.heading,p.desc,{clearOnly:true,size:'md'})+'<div class="post-card-heading pt-fill">'+escH(p.heading)+'</div></div>':'<div></div>')+
      '<button class="pst-pin'+(p.pinned?' on':'')+'" onclick="togglePostPin('+p.id+')" title="'+(p.pinned?'Unpin':'Pin')+'">&#128204;</button>'+
    '</div>'+
    (bodyHtml?'<div style="margin-bottom:.5rem">'+bodyHtml+'</div>':'')+
    (function(){
      var imgs=parseImgs(p.images);
      if(!imgs.length) return '';
      return '<div class="pst-imgs">'+imgs.map(function(im){
        return '<img class="pst-img" src="'+escH(im.thumb)+'" alt="" loading="lazy" '+
               'onclick="openLightbox(\''+escH(im.url).replace(/'/g,"\\'")+'\')" '+
               'onerror="this.style.display=\'none\'">';
      }).join('')+'</div>';
    })()+
    '<div class="post-card-meta">'+srcBadge+'<span class="post-date">'+p.date+'</span></div>'+
    (urlHtml?urlHtml:'')+
    '<div class="pst-emo-row"><span class="pst-emo-lbl">Emotion</span>'+
      '<select class="pst-emo-sel" onchange="setPostEmotion('+p.id+',this)">'+emoOptionsHTML(p.emotion,'No emotion')+'</select>'+
    '</div>'+
    '<div class="post-card-foot"><button class="del-btn" onclick="delPost('+p.id+')">&#128465; Delete</button>'+
      '<button class="btn" style="font-size:11px;padding:4px 12px" onclick="editPost('+p.id+')">\u270f Edit</button></div>'+
  '</div>';
}

function renderPosts(){
  var searchEl=document.getElementById('post-search'); if(!searchEl) return;
  var search=(searchEl.value||'').toLowerCase().trim(),sort=document.getElementById('post-sort').value;
  var pinnedCount=posts.filter(function(p){return p.pinned;}).length;
  var cp=document.getElementById('pst-ct-pinned'); if(cp) cp.textContent=pinnedCount;
  var ca=document.getElementById('pst-ct-all');    if(ca) ca.textContent=posts.length;

  renderPostEmoFilter();
  refreshNewPostEmo();
  wireDropZone('up-zone-new','post-imgs','up-prog-new','up-thumbs-new');

  var list=posts.slice();
  if(postView==='pinned') list=list.filter(function(p){return p.pinned;});
  if(postSrcFilter!=='all')list=list.filter(function(p){return p.source===postSrcFilter;});
  if(postEmoFilter!=='all')list=list.filter(function(p){return (p.emotion||'').toLowerCase()===postEmoFilter.toLowerCase();});
  if(search)list=list.filter(function(p){return((p.heading||'')+(p.desc||'')+(p.url||'')+(p.source||'')+(p.emotion||'')).toLowerCase().includes(search);});
  if(sort==='oldest')list.sort(function(a,b){return a.timestamp-b.timestamp;});else list.sort(function(a,b){return b.timestamp-a.timestamp;});

  var base = postView==='pinned' ? pinnedCount : posts.length;
  document.getElementById('post-meta').textContent=list.length+' of '+base+(postView==='pinned'?' pinned':'')+' post'+(base!==1?'s':'');
  var log=document.getElementById('post-log');
  if(!list.length){
    var msg = postView==='pinned'
      ? (pinnedCount===0 ? 'Nothing pinned yet.<br>Tap &#128204; on any post in All posts to pin it here.' : 'No pinned posts match this filter.')
      : (posts.length===0 ? 'No posts saved yet.<br>Save the first post that inspired you.' : 'No matches for the current filter.');
    log.innerHTML='<div class="sit-empty"><div style="font-size:28px;margin-bottom:10px">&#128204;</div>'+msg+'</div>';
    return;
  }
  log.innerHTML=list.map(postCardHTML).join('');
}

async function togglePostPin(id){
  var p=posts.find(function(x){return x.id===id;}); if(!p) return;
  p.pinned=!p.pinned;
  renderPosts();
  var ok=await postToSheet({sheet:'Posts',action:'pin_post',sheetId:p.sheetId||'',pinned:p.pinned?'yes':'no'});
  showToast(ok?(p.pinned?'Pinned \u2713':'Unpinned'):'Sync failed \u2014 pin not saved.',ok?'success':'error');
}

async function setPostEmotion(id,sel){
  var p=posts.find(function(x){return x.id===id;}); if(!p) return;
  var v=resolveEmoPick(sel);
  if(v===null){ renderPosts(); return; }     // cancelled "add new"
  p.emotion=v;
  renderPosts();
  var ok=await postToSheet({sheet:'Posts',action:'set_post_emotion',sheetId:p.sheetId||'',emotion:v});
  if(!ok) showToast('Sync failed \u2014 emotion not saved.','error');
}

/* Deleting now removes the row from the Sheet too. Previously this
   only removed it locally, so deleted posts reappeared on reload. */
async function delPost(id){
  var p=posts.find(function(x){return x.id===id;}); if(!p) return;
  if(!confirm('Delete this post?')) return;
  posts=posts.filter(function(x){return x.id!==id;});
  updatePostBadge(); renderPosts();
  var ok=await postToSheet({sheet:'Posts',action:'delete_post',sheetId:p.sheetId||''});
  showToast(ok?'Deleted.':'Sync failed \u2014 post may return on reload.',ok?'':'error');
}

function exportPostsCSV(){if(!posts.length){showToast('Nothing to export.','error');return;}var h=['Date','Heading','Description','Source','URL','Emotion','Pinned'];var rows=posts.map(function(p){return[p.date,p.heading||'',p.desc||'',p.source||'',p.url||'',p.emotion||'',p.pinned?'yes':'no'].map(function(v){return'"'+String(v).replace(/"/g,'""')+'"';}).join(',');});var a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent([h.join(',')].concat(rows).join('\n'));a.download='posts-'+isoToday()+'.csv';a.click();showToast('CSV exported \u2713','success');}

async function fetchAllPosts(){
  var d=await sheetFetch(WORKER_URL+'?action=getAllPosts');
  if(d&&d.status==='ok'&&Array.isArray(d.posts)) replacePostsFromSheet(d.posts);
  else console.warn('[Posts] bad response:',d);
}

function replacePostsFromSheet(s){
  localStorage.removeItem('morning_posts');
  posts=s.map(function(x,i){
    return {id:x.sheetId?parseInt(x.sheetId,10):Date.now()+i,
      timestamp:x.dateISO?new Date(x.dateISO).getTime():Date.now(),
      dateISO:x.dateISO||'',date:x.date||'',heading:x.heading||'',desc:x.desc||'',
      source:x.source||'',url:x.url||'',emotion:x.emotion||'',sheetId:x.sheetId||'',
      pinned:String(x.pinned||'').toLowerCase()==='yes',images:x.images||''};
  });
  posts.sort(function(a,b){return b.timestamp-a.timestamp;});
  updatePostBadge();
  renderPosts();
}

/* EDIT MODAL */
var _editCtx=null;
function openEditModal(title,bodyHTML,ctx){_editCtx=ctx;document.getElementById('modal-title').textContent=title;document.getElementById('modal-body').innerHTML=bodyHTML;document.getElementById('edit-modal').style.display='block';document.body.style.overflow='hidden';}
function closeEditModal(){document.getElementById('edit-modal').style.display='none';document.body.style.overflow='';_editCtx=null;}
document.getElementById('edit-modal').addEventListener('click',function(e){if(e.target===this)closeEditModal();});

function editSituation(id){
  var sit=situations.find(function(s){return s.id===id;});if(!sit)return;
  var emoOptions=['anger','anxiety','frustration','hurt','shame','overwhelm','fear','jealousy'];
  var emoEmojis={anger:'&#128548;',anxiety:'&#128560;',frustration:'&#128547;',hurt:'&#128148;',shame:'&#128532;',overwhelm:'&#127754;',fear:'&#128552;',jealousy:'&#128065;'};
  var emoPills=emoOptions.map(function(e){return '<button class="ep'+(sit.emotion===e?' on':'')+'" data-val="'+e+'" onclick="this.parentNode.querySelectorAll(\'.ep\').forEach(function(x){x.classList.remove(\'on\')});this.classList.add(\'on\')">'+emoEmojis[e]+' '+e+'</button>';}).join('');
  var html='<div style="margin-bottom:10px"><label class="sfl">What happened?</label><textarea class="sin" id="edit-sit-title" rows="2">'+escH(sit.title)+'</textarea></div>'+
    '<div class="sit-flds" style="margin-bottom:10px"><div><label class="sfl">What triggered me?</label><textarea class="sin" id="edit-sit-trigger" rows="3">'+escH(sit.trigger||'')+'</textarea></div><div><label class="sfl">How did I respond?</label><textarea class="sin" id="edit-sit-reaction" rows="3">'+escH(sit.reaction||'')+'</textarea></div></div>'+
    '<label class="sfl">Dominant emotion</label><div class="epills" id="edit-emo-pills" style="margin-bottom:10px">'+emoPills+'</div>'+
    '<label class="sfl">Strategy / better response</label><textarea class="sin" id="edit-sit-strategy" rows="3" placeholder="What will you do differently next time...">'+escH(sit.strategy||'')+'</textarea>';
  openEditModal('Edit situation',html,{type:'situation',id:id});
}

function editThought(id){
  var th=thoughts.find(function(t){return t.id===id;});if(!th)return;
  var catOptions=['mindset','emotion','focus','discipline','relationships','philosophy','business','life'];
  var catIcons={mindset:'&#129504;',emotion:'&#10084;&#65039;',focus:'&#127919;',discipline:'&#9889;',relationships:'&#129306;',philosophy:'&#128214;',business:'&#128188;',life:'&#127807;'};
  var emoOptions=['inspired','calm','motivated','grateful','reflective','challenged'];
  var emoIcons={inspired:'&#10024;',calm:'&#129528;',motivated:'&#128293;',grateful:'&#128591;',reflective:'&#129710;',challenged:'&#128170;'};
  var catPills=catOptions.map(function(c){return '<button class="thp'+(th.category===c?' on':'')+'" data-val="'+c+'" onclick="this.parentNode.querySelectorAll(\'.thp\').forEach(function(x){x.classList.remove(\'on\')});this.classList.add(\'on\')">'+(catIcons[c]||'')+' '+c+'</button>';}).join('');
  var emoPills=emoOptions.map(function(e){return '<button class="thp'+(th.emotion===e?' on':'')+'" data-val="'+e+'" onclick="this.parentNode.querySelectorAll(\'.thp\').forEach(function(x){x.classList.remove(\'on\')});this.classList.add(\'on\')">'+(emoIcons[e]||'')+' '+e+'</button>';}).join('');
  var html='<div style="margin-bottom:10px"><label class="sfl">Heading</label><input class="sin" id="edit-th-heading" type="text" value="'+escH(th.heading||'')+'"></div>'+
    '<div style="margin-bottom:10px"><label class="sfl">Description (&#8226; or - for bullets)</label><textarea class="sin" id="edit-th-text" rows="6">'+escH(th.text||'')+'</textarea></div>'+
    '<div style="margin-bottom:10px"><label class="sfl">Source or URL</label><input class="sin" id="edit-th-url" type="text" value="'+escH(th.url||'')+'"></div>'+
    '<label class="sfl">Category</label><div class="th-cat-pills" id="edit-cat-pills" style="margin-bottom:10px">'+catPills+'</div>'+
    '<label class="sfl">Emotion</label><div class="th-emo-pills" id="edit-emo-pills">'+emoPills+'</div>';
  openEditModal('Edit thought',html,{type:'thought',id:id});
}

function editPost(id){
  var p=posts.find(function(x){return x.id===id;});if(!p)return;
  var srcOpts=[['linkedin','&#128188; LinkedIn'],['instagram','&#128248; Instagram'],['other','&#127760; Other']];
  var srcPills=srcOpts.map(function(s){var a=p.source===s[0];return '<button class="src-pill'+(a?' on-'+s[0].substring(0,2):'')+'" data-src="'+s[0]+'" onclick="this.parentNode.querySelectorAll(\'.src-pill\').forEach(function(b){b.className=\'src-pill\'});this.className=\'src-pill on-\'+this.dataset.src.substring(0,2)">'+s[1]+'</button>';}).join('');
  var html='<div style="margin-bottom:10px"><label class="sfl">Heading</label><input class="sin" id="edit-post-heading" type="text" value="'+escH(p.heading||'')+'"></div>'+
    '<div style="margin-bottom:10px"><label class="sfl">Description</label><textarea class="sin" id="edit-post-desc" rows="5">'+escH(p.desc||'')+'</textarea></div>'+
    '<div style="margin-bottom:10px"><label class="sfl">Source</label><div class="src-pills" id="edit-src-pills">'+srcPills+'</div></div>'+
    '<div style="margin-bottom:10px"><label class="sfl">URL</label><input class="sin" id="edit-post-url" type="text" value="'+escH(p.url||'')+'"></div>'+
    '<div style="margin-bottom:10px"><label class="sfl">Emotion</label><select class="sin pst-emo-sel" id="edit-post-emo" onchange="editPostEmoPick(this)">'+emoOptionsHTML(p.emotion,'No emotion')+'</select></div>'+
    '<div style="margin-bottom:10px"><label class="sfl">Screenshots</label>'+
    '<div class="up-zone" id="up-zone-edit" onclick="document.getElementById(\'up-file-edit\').click()">'+
      '<div class="up-zone-t">&#128247; Tap to add images, or drag them here</div>'+
      '<div class="up-zone-s">Ctrl+V works too</div></div>'+
    '<input type="file" id="up-file-edit" accept="image/*" multiple style="display:none" '+
      'onchange="handleUpload(this.files,\'edit-post-imgs\',\'up-prog-edit\',\'up-thumbs-edit\')">'+
    '<div class="up-prog" id="up-prog-edit"></div><div class="up-bar" id="up-bar-edit"><div class="up-bar-fill" id="up-bar-fill-edit"></div></div>'+
    '<div class="up-thumbs" id="up-thumbs-edit"></div>'+
    '<textarea class="sin" id="edit-post-imgs" rows="2" style="display:none">'+escH(p.images||'')+'</textarea>'+
    '</div>'+
    '<label class="pst-pin-chk"><input type="checkbox" id="edit-post-pin"'+(p.pinned?' checked':'')+'> &#128204; Pinned</label>';
  openEditModal('Edit post',html,{type:'post',id:id});
  wireDropZone('up-zone-edit','edit-post-imgs','up-prog-edit','up-thumbs-edit');
  renderUploadThumbs('edit-post-imgs','up-thumbs-edit');
}

function editPostEmoPick(sel){
  var v=resolveEmoPick(sel);
  if(v===null){ sel.value=''; return; }
  sel.innerHTML=emoOptionsHTML(v,'No emotion');
}

async function saveEditModal(){
  if(!_editCtx)return;
  if(_editCtx.type==='diag'){closeEditModal();return;}

  if(_editCtx.type==='habit'){
    var btnH=document.getElementById('modal-save-btn');
    var oldText=_editCtx.oldText;
    var newText=(document.getElementById('edit-habit-text').value||'').trim();
    if(!newText){ showToast('Habit cannot be empty.','error'); return; }
    if(newText===oldText){ closeEditModal(); return; }
    if(habitList.some(function(t){return t.toLowerCase()===newText.toLowerCase() && t!==oldText;})){
      showToast('You already follow a habit with that wording.','error'); return;
    }
    btnH.textContent='Saving...'; btnH.disabled=true;

    // Update in-memory state first so the UI responds immediately
    habitList=habitList.map(function(t){return t===oldText?newText:t;});
    Object.keys(habitDone).forEach(function(d){
      habitDone[d]=habitDone[d].map(function(t){return t===oldText?newText:t;});
    });
    habitArchive=habitArchive.map(function(t){return t===oldText?newText:t;});
    renderTodayHabits();
    renderMaster();
    renderRoutine();
    initSections();

    // Rewrite the label across every row in the Sheet
    var okR=await postToSheet({sheet:'TodayHabits',action:'rename_habit',oldText:oldText,newText:newText});
    // Then write today's row so the current tick state is right
    if(okR) await saveTodayHabits();
    // Pull it all back so what you see is exactly what the Sheet holds
    if(okR) await fetchAllTodayHabits();

    btnH.textContent='Save changes \u2197'; btnH.disabled=false;
    closeEditModal();
    showToast(okR?'Habit updated \u2713':'Updated locally \u2014 Sheet sync failed.',okR?'success':'error');
    return;
  }
  var btn=document.getElementById('modal-save-btn');btn.textContent='Saving...';btn.disabled=true;
  if(_editCtx.type==='situation'){
    var sit=situations.find(function(s){return s.id===_editCtx.id;});if(!sit){closeEditModal();return;}
    sit.title=document.getElementById('edit-sit-title').value.trim();sit.trigger=document.getElementById('edit-sit-trigger').value.trim();sit.reaction=document.getElementById('edit-sit-reaction').value.trim();sit.strategy=document.getElementById('edit-sit-strategy').value.trim();
    var selEmoEl=document.querySelector('#edit-emo-pills .ep.on');sit.emotion=selEmoEl?selEmoEl.dataset.val:sit.emotion;saveSits();
    var ok=await postToSheet({sheet:'Situations',action:'edit_situation',dateISO:sit.dateISO,title:sit.title,trigger:sit.trigger,reaction:sit.reaction,emotion:sit.emotion,strategy:sit.strategy});
    closeEditModal();renderStats();renderPast();showToast(ok?'Situation updated \u2713':'Updated locally -- Sheet sync pending.',ok?'success':'');
  }else if(_editCtx.type==='thought'){
    var th=thoughts.find(function(t){return t.id===_editCtx.id;});if(!th){closeEditModal();return;}
    th.heading=document.getElementById('edit-th-heading').value.trim();th.text=document.getElementById('edit-th-text').value.trim();th.url=document.getElementById('edit-th-url').value.trim();
    var selCatEl=document.querySelector('#edit-cat-pills .thp.on'),selEmoEl2=document.querySelector('#edit-emo-pills .thp.on');th.category=selCatEl?selCatEl.dataset.val:th.category;th.emotion=selEmoEl2?selEmoEl2.dataset.val:th.emotion;saveThoughts();
    var ok2=await postToSheet({sheet:'Thoughts',action:'edit_thought',sheetId:th.sheetId||'',dateISO:th.dateISO,heading:th.heading,text:th.text,url:th.url,category:th.category,emotion:th.emotion});
    closeEditModal();renderThoughts();showToast(ok2?'Thought updated \u2713':'Updated locally -- Sheet sync pending.',ok2?'success':'');
  }else if(_editCtx.type==='post'){
    var p=posts.find(function(x){return x.id===_editCtx.id;});if(!p){closeEditModal();return;}
    p.heading=document.getElementById('edit-post-heading').value.trim();
    p.desc=document.getElementById('edit-post-desc').value.trim();
    p.url=document.getElementById('edit-post-url').value.trim();
    var selSrcEl=document.querySelector('#edit-src-pills .src-pill[class*="on-"]');
    p.source=selSrcEl?selSrcEl.dataset.src:p.source;
    var es=document.getElementById('edit-post-emo');
    p.emotion=(es&&es.value!=='__new')?es.value:p.emotion;
    p.images=document.getElementById('edit-post-imgs').value.trim();
    var wasPinned=p.pinned;
    p.pinned=document.getElementById('edit-post-pin').checked;
    renderPosts();
    var ok3=await postToSheet({sheet:'Posts',action:'edit_post',sheetId:p.sheetId||'',dateISO:p.dateISO,
      heading:p.heading,desc:p.desc,source:p.source,url:p.url,emotion:p.emotion,images:p.images});
    // edit_post leaves column J alone, so pin state is written separately
    if(ok3 && wasPinned!==p.pinned){
      ok3=await postToSheet({sheet:'Posts',action:'pin_post',sheetId:p.sheetId||'',pinned:p.pinned?'yes':'no'});
    }
    closeEditModal();
    showToast(ok3?'Post updated \u2713':'Sync failed \u2014 changes not saved.',ok3?'success':'error');
  }else if(_editCtx.type==='habit'){
    var h=habits.find(function(x){return x.id===_editCtx.id;});if(!h){closeEditModal();return;}
    var selEmoEl=document.querySelector('#edit-hab-emo-pills .ep.on');
    h.emotion=selEmoEl?selEmoEl.dataset.val:h.emotion;
    h.text=document.getElementById('edit-hab-text').value.trim();
    saveHabits();
    var ok4=await postToSheet({sheet:'Habits',action:'edit_habit',sheetId:h.sheetId||'',dateISO:h.dateISO,emotion:h.emotion,text:h.text});
    closeEditModal();renderHabits();showToast(ok4?'Habit updated ✓':'Updated locally -- Sheet sync pending.',ok4?'success':'');
  }else if(_editCtx.type==='motivation'){
    var e=motEntries.find(function(x){return x.id===_editCtx.id;}); if(!e){closeEditModal();return;}
    var selCatEl=document.querySelector('#edit-mot-cat-pills .mcp.on');
    if(selCatEl) e.category=selCatEl.dataset.val;
    e.text=document.getElementById('edit-mot-text').value.trim();
    var exE=document.getElementById('edit-mot-example'); if(exE) e.example=exE.value.trim();
    saveMotivation();
    var okm=await postToSheet({sheet:'Motivation',action:'edit_motivation',
      sheetId:e.sheetId||'',category:e.category,text:e.text,pinned:e.pinned?'yes':'no',example:e.example||''});
    closeEditModal(); renderMotivation();
    showToast(okm?'Entry updated ✓':'Updated locally — Sheet sync pending.',okm?'success':'');
  }else if(_editCtx.type==='master'){
    var mh=masterById(_editCtx.id); if(!mh){closeEditModal();return;}
    var nt=document.getElementById('edit-m-time').value.trim();
    var nh=document.getElementById('edit-m-habit').value.trim();
    if(!nh){showToast('Habit cannot be empty.','error');btn.textContent='Save changes \u2197';btn.disabled=false;return;}
    mh.time=nt; mh.habit=nh;
    renderMaster(); renderRoutine();
    var okm2=await postToSheet({sheet:'HabitMaster',action:'edit_master',sheetId:mh.sheetId,time:nt,habit:nh});
    closeEditModal();
    showToast(okm2?'Habit updated \u2713':'Updated locally \u2014 sync failed.',okm2?'success':'error');
  }else if(_editCtx.type==='guide'){
    var gg=guide.find(function(x){return x.sheetId===_editCtx.id;}); if(!gg){closeEditModal();return;}
    gg.category=document.getElementById('eg-cat').value.trim()||'Other';
    var pv=document.getElementById('eg-planet').value.trim();
    gg.planet=(pv==='\u2014')?'':pv;
    gg.situation=document.getElementById('eg-sit').value.trim();
    gg.action=document.getElementById('eg-act').value.trim();
    gg.why=document.getElementById('eg-why').value.trim();
    gg.astro=document.getElementById('eg-astro').value.trim();
    renderGuide();
    var okg=await postToSheet({sheet:'Guide',action:'edit_guide',sheetId:gg.sheetId,
      category:gg.category,planet:gg.planet,situation:gg.situation,
      action_text:gg.action,why:gg.why,astro:gg.astro});
    closeEditModal();
    showToast(okg?'Updated \u2713':'Sync failed.',okg?'success':'error');
  }else if(_editCtx.type==='sitplan'){
    var sp=planById(_editCtx.id); if(!sp){closeEditModal();return;}
    var ns=document.getElementById('edit-spl-sit').value.trim();
    var na=document.getElementById('edit-spl-app').value.trim();
    if(!ns||!na){showToast('Both halves are needed.','error');btn.textContent='Save changes \u2197';btn.disabled=false;return;}
    sp.situation=ns; sp.approach=na;
    renderPlanLibrary(); renderSitRows();
    var oksp=await postToSheet({sheet:'SituationPlans',action:'edit_plan',sheetId:sp.sheetId,situation:ns,approach:na});
    closeEditModal();
    showToast(oksp?'Plan updated \u2713':'Sync failed.',oksp?'success':'error');
  }else if(_editCtx.type==='routine'){
    var ri=routineItems.find(function(x){return x.sheetId===_editCtx.id;}); if(!ri){closeEditModal();return;}
    ri.time=document.getElementById('edit-rt-time').value.trim();
    ri.habit=document.getElementById('edit-rt-habit').value.trim();
    ri.intention='';   // retired from the UI
    renderRoutine();
    var okrt=await postToSheet({sheet:'Routines',action:'edit_routine_item',sheetId:ri.sheetId,
      time:ri.time,intention:ri.intention,habit:ri.habit});
    if(okrt) await fetchAllRoutines();
    closeEditModal(); renderRoutine();
    showToast(okrt?'Item updated \u2713':'Updated locally \u2014 sync failed.',okrt?'success':'error');
  }else if(_editCtx.type==='kundali'){
    var ke=kunEntries.find(function(x){return x.id===_editCtx.id;}); if(!ke){closeEditModal();return;}
    var selCat=document.querySelector('#edit-kun-cat-pills .kcp.on');
    var newLearning=document.getElementById('edit-kun-learning').value.trim();
    if(!newLearning){showToast('The learning cannot be empty.','error');btn.textContent='Save changes \u2197';btn.disabled=false;return;}
    if(selCat) ke.category=selCat.dataset.val;
    ke.learning=newLearning;
    ke.logic=document.getElementById('edit-kun-logic').value.trim();
    renderKundali();
    var okk=await postToSheet({sheet:'Kundali',action:'edit_kundali',sheetId:ke.sheetId||'',
      category:ke.category,learning:ke.learning,logic:ke.logic});
    if(okk) await fetchAllKundali();   // pull the updated row back from the Sheet
    closeEditModal(); renderKundali();
    showToast(okk?'Learning updated \u2713':'Updated locally \u2014 Sheet sync failed.',okk?'success':'error');
  }else if(_editCtx.type==='gratitude'){
    var e=gratEntries.find(function(x){return x.id===_editCtx.id;}); if(!e){closeEditModal();return;}
    var g1=document.getElementById('edit-grat-1').value.trim();
    var g2=document.getElementById('edit-grat-2').value.trim();
    var g3=document.getElementById('edit-grat-3').value.trim();
    e.items=[g1,g2,g3].filter(function(x){return x.length>0;});
    var selEmoEl=document.querySelector('#edit-grat-emo-pills .pep.on');
    e.emotion=selEmoEl?selEmoEl.dataset.val:e.emotion;
    saveGratitude();
    var ok=await postToSheet({sheet:'Gratitude',action:'edit_gratitude',sheetId:e.sheetId||'',
      dateISO:e.dateISO,item1:e.items[0]||'',item2:e.items[1]||'',item3:e.items[2]||'',emotion:e.emotion});
    closeEditModal(); updateGratStats(); renderGratitude();
    showToast(ok?'Entry updated ✓':'Updated locally — Sheet sync pending.',ok?'success':'');
  }
  btn.textContent='Save changes ↗';btn.disabled=false;
}

/* HABITS */
var habits=[], selHabEmotion='', habEmoFilter='all';
var HAB_EMO_ICONS={anger:'&#128548;',anxiety:'&#128560;',frustration:'&#128547;',hurt:'&#128148;',shame:'&#128532;',overwhelm:'&#127754;',fear:'&#128552;',jealousy:'&#128065;',sadness:'&#128546;',stress:'&#128165;'};

function loadHabits(){try{var r=localStorage.getItem('morning_habits');if(r)habits=JSON.parse(r);}catch(e){habits=[];}}
function saveHabits(){localStorage.setItem('morning_habits',JSON.stringify(habits));}
function updateHabBadge(){var el=document.getElementById('hab-badge');if(el)el.textContent=habits.length;}

function selHabEmo(el){document.querySelectorAll('#hab-emo-pills .ep').forEach(function(p){p.classList.remove('on');});selHabEmotion=(selHabEmotion===el.dataset.val)?'':el.dataset.val;if(selHabEmotion)el.classList.add('on');}
function setHabEmoFilter(el){document.querySelectorAll('#hab-emo-filter .ef').forEach(function(p){p.classList.remove('on');});el.classList.add('on');habEmoFilter=el.dataset.he;renderHabits();}

async function addHabit(){
  var text=document.getElementById('hab-text').value.trim();
  if(!text){showToast('Describe the habit first.','error');return;}
  if(!selHabEmotion){showToast('Select an emotion first.','error');return;}
  var now=new Date(),hid=String(Date.now());
  var h={id:Date.now(),timestamp:Date.now(),sheetId:hid,dateISO:isoDate(now),date:now.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}),emotion:selHabEmotion,text:text};
  habits.unshift(h);saveHabits();updateHabBadge();
  document.getElementById('hab-text').value='';selHabEmotion='';
  document.querySelectorAll('#hab-emo-pills .ep').forEach(function(p){p.classList.remove('on');});
  var syncEl=document.getElementById('hab-sync');syncEl.textContent='Syncing...';syncEl.className='sync-txt syncing';
  var ok=await postToSheet({sheet:'Habits',sheetId:hid,date:h.date,dateISO:h.dateISO,emotion:h.emotion,text:h.text});
  syncEl.textContent=ok?'Synced to Sheet ✓':'Saved locally (Sheet unreachable)';syncEl.className='sync-txt '+(ok?'ok':'err');
  showToast(ok?'Habit added ✓':'Saved locally -- sync failed.',ok?'success':'error');
  renderHabits();
}

function habCardHTML(h){
  var emoBadge=h.emotion?'<span class="emo-badge" style="background:rgba(201,168,76,0.11);border-color:rgba(201,168,76,0.28);color:var(--gold)">'+(HAB_EMO_ICONS[h.emotion]||'')+' '+h.emotion+'</span>':'';
  // Convert || separators (old format) to newlines so they render as paragraphs
  var normalised=(h.text||'').replace(/\s*\|\|\s*/g,'\n');
  var bodyHtml=renderBullets(normalised);
  return '<div class="post-card" id="hab-'+h.id+'">'+
    '<div class="post-card-meta">'+emoBadge+'<span class="post-date">'+h.date+'</span></div>'+
    '<div class="th-card-body" style="margin-bottom:.6rem">'+bodyHtml+'</div>'+
    '<div class="post-card-foot"><button class="del-btn" onclick="delHabit('+h.id+')">&#128465; Delete</button>'+
    '<button class="btn" style="font-size:11px;padding:4px 12px" onclick="editHabit('+h.id+')">&#9998; Edit</button></div>'+
  '</div>';
}

function renderHabits(){
  var search=(document.getElementById('hab-search').value||'').toLowerCase().trim();
  var list=habits.slice();
  if(habEmoFilter!=='all')list=list.filter(function(h){return h.emotion===habEmoFilter;});
  if(search)list=list.filter(function(h){return(h.text+h.emotion).toLowerCase().includes(search);});
  list.sort(function(a,b){return b.timestamp-a.timestamp;});
  document.getElementById('hab-meta').textContent=list.length+' of '+habits.length+' habit'+(habits.length!==1?'s':'');
  var log=document.getElementById('hab-log');
  if(!list.length){log.innerHTML='<div class="sit-empty"><div style="font-size:28px;margin-bottom:10px">&#127775;</div>'+(habits.length===0?'No habits yet.<br>Add your first practical technique for managing an emotion.':'No matches for the current filter.')+'</div>';return;}
  log.innerHTML=list.map(habCardHTML).join('');
}

function delHabit(id){if(!confirm('Delete this habit?'))return;habits=habits.filter(function(h){return h.id!==id;});saveHabits();updateHabBadge();renderHabits();showToast('Deleted.','');}

function editHabit(id){
  var h=habits.find(function(x){return x.id===id;});if(!h)return;
  var emoOpts=['anger','anxiety','frustration','hurt','shame','overwhelm','fear','jealousy','sadness','stress'];
  var emoPills=emoOpts.map(function(e){return '<button class="ep'+(h.emotion===e?' on':'')+'" data-val="'+e+'" onclick="this.parentNode.querySelectorAll(\'.ep\').forEach(function(x){x.classList.remove(\'on\')});this.classList.add(\'on\')">'+(HAB_EMO_ICONS[e]||'')+' '+e+'</button>';}).join('');
  var html='<div style="margin-bottom:10px"><label class="sfl">Emotion</label><div class="epills" id="edit-hab-emo-pills">'+emoPills+'</div></div>'+
    '<div><label class="sfl">The habit / practical action <span style="color:var(--text-3);font-weight:400">(&#8226; or - for bullets)</span></label>'+
    '<textarea class="sin" id="edit-hab-text" rows="8">'+escH(h.text)+'</textarea>'+
    '<div style="font-size:10px;color:var(--text-3);margin-top:4px">Start each line with <code style="background:rgba(255,255,255,0.07);padding:1px 5px;border-radius:3px;color:var(--text-2)">&#8226;</code> or <code style="background:rgba(255,255,255,0.07);padding:1px 5px;border-radius:3px;color:var(--text-2)">-</code> to create bullet points</div></div>';
  openEditModal('Edit habit',html,{type:'habit',id:id});
}

function exportHabitsCSV(){
  if(!habits.length){showToast('Nothing to export.','error');return;}
  var h=['Date','Emotion','Habit'];
  var rows=habits.map(function(x){return[x.date,x.emotion||'',x.text||''].map(function(v){return'"'+String(v).replace(/"/g,'""')+'"';}).join(',');});
  var a=document.createElement('a');
  a.href='data:text/csv;charset=utf-8,'+encodeURIComponent([h.join(',')].concat(rows).join('\n'));
  a.download='habits-'+isoToday()+'.csv';a.click();showToast('CSV exported ✓','success');
}

/* MOTIVATION */
var motEntries = [];
var motView='pinned';   // 'all' | 'pinned' — Pinned opens first
var selMotCategory = '';
var motCatFilter = 'all';

var MOT_CAT_COLORS = {habit:'#C9A84C', practice:'#4ECDC4', principle:'#6BBF8E', mantra:'#E07B7B', reminder:'#9A97A0'};
var MOT_CAT_ICONS  = {habit:'&#127775;', practice:'&#129490;', principle:'&#128214;', mantra:'&#128591;', reminder:'&#128276;'};

function loadMotivation(){try{var r=localStorage.getItem('morning_motivation');if(r)motEntries=JSON.parse(r);}catch(e){motEntries=[];}}
function saveMotivation(){localStorage.setItem('morning_motivation',JSON.stringify(motEntries));}

function selMotCat(el){
  document.querySelectorAll('.mot-cat-pills .mcp').forEach(function(p){
    p.classList.remove('on'); p.style.background=''; p.style.borderColor=''; p.style.color='';
  });
  selMotCategory=(selMotCategory===el.dataset.val)?'':el.dataset.val;
  if(selMotCategory){
    el.classList.add('on');
    var col=MOT_CAT_COLORS[selMotCategory]||'var(--gold)';
    el.style.background=col+'22'; el.style.borderColor=col+'88'; el.style.color=col;
  }
}

function setMotView(v){
  motView=v;
  document.getElementById('mot-tab-pinned').classList.toggle('on',v==='pinned');
  document.getElementById('mot-tab-all').classList.toggle('on',v==='all');
  renderMotivation();
}

function setMotCatFilter(el){
  document.querySelectorAll('#mot-cat-filter .mf').forEach(function(p){p.classList.remove('on');});
  el.classList.add('on'); motCatFilter=el.dataset.mc; renderMotivation();
}

async function addMotEntry(){
  var text=document.getElementById('mot-text').value.trim();
  if(!text){showToast('Write your habit, practice or principle first.','error');return;}
  if(!selMotCategory){showToast('Pick a category first.','error');return;}
  var now=new Date(), mid=String(Date.now());
  var e={id:Date.now(),timestamp:Date.now(),sheetId:mid,
    dateISO:isoDate(now),date:now.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}),
    category:selMotCategory,text:text,pinned:false,
    example:(document.getElementById('mot-example')||{value:''}).value.trim()};
  motEntries.unshift(e); saveMotivation();
  document.getElementById('mot-text').value=''; selMotCategory='';
  var exEl=document.getElementById('mot-example'); if(exEl) exEl.value='';
  document.querySelectorAll('.mot-cat-pills .mcp').forEach(function(p){p.classList.remove('on');p.style.background='';p.style.borderColor='';p.style.color='';});
  var syncEl=document.getElementById('mot-sync');
  syncEl.textContent='Syncing…'; syncEl.className='sync-txt syncing';
  var ok=await postToSheet({sheet:'Motivation',sheetId:mid,date:e.date,dateISO:e.dateISO,category:e.category,text:e.text,pinned:'no',example:e.example});
  syncEl.textContent=ok?'Synced to Sheet ✓':'Saved locally (Sheet unreachable)';
  syncEl.className='sync-txt '+(ok?'ok':'err');
  showToast(ok?'Added to morning read ✓':'Saved locally — sync failed.',ok?'success':'error');
  renderMotivation();
}

async function togglePin(id){
  var e=motEntries.find(function(x){return x.id===id;}); if(!e)return;
  e.pinned=!e.pinned; saveMotivation(); renderMotivation();
  await postToSheet({sheet:'Motivation',action:'edit_motivation',
    sheetId:e.sheetId||'',category:e.category,text:e.text,pinned:e.pinned?'yes':'no'});
}

function motCardHTML(e){
  var col=MOT_CAT_COLORS[e.category]||'#9A97A0';
  var icon=MOT_CAT_ICONS[e.category]||'';
  var catLabel=e.category?e.category.charAt(0).toUpperCase()+e.category.slice(1):'';
  return '<div class="mot-card'+(e.pinned?' pinned':'')+'">'+
    '<div class="mot-card-cat"><div class="mot-cat-dot" style="background:'+col+'"></div>'+
    '<span style="color:'+col+'">'+icon+' '+catLabel+'</span>'+
    (e.pinned?'<span style="margin-left:auto;font-size:10px;color:var(--gold)">&#128204; pinned</span>':'')+'</div>'+
    '<div class="pt-row">'+ptTile(e.text,'',{clearOnly:true,size:'md'})+'<div class="mot-card-text pt-fill">'+escH(e.text)+'</div></div>'+
    (e.example?'<div class="mot-example"><span class="mot-ex-l">&#128221; From my life</span>'+escH(e.example)+'</div>':'')+
    '<div class="mot-card-foot">'+
      '<button class="del-btn" onclick="delMotEntry('+e.id+')">&#128465; Delete</button>'+
      '<div style="display:flex;gap:6px">'+
        '<button class="mot-pin-btn'+(e.pinned?' pinned':'')+'" onclick="togglePin('+e.id+')">'+(e.pinned?'&#128204; Unpin':'&#128204; Pin for top')+'</button>'+
        '<button class="btn" style="font-size:11px;padding:4px 12px" onclick="editMotEntry('+e.id+')">✏ Edit</button>'+
      '</div>'+
    '</div>'+
  '</div>';
}

function renderMotivation(){
  var search=(document.getElementById('mot-search').value||'').toLowerCase().trim();
  var pinnedCount=motEntries.filter(function(e){return e.pinned;}).length;
  var cp=document.getElementById('mot-ct-pinned'); if(cp) cp.textContent=pinnedCount;
  var ca=document.getElementById('mot-ct-all');    if(ca) ca.textContent=motEntries.length;

  var list=motEntries.slice();
  if(motView==='pinned') list=list.filter(function(e){return e.pinned;});
  if(motCatFilter!=='all') list=list.filter(function(e){return e.category===motCatFilter;});
  if(search) list=list.filter(function(e){return(e.text+' '+e.category+' '+(e.example||'')).toLowerCase().includes(search);});
  // Pinned always float to top
  list.sort(function(a,b){
    if(a.pinned&&!b.pinned)return -1; if(!a.pinned&&b.pinned)return 1;
    return b.timestamp-a.timestamp;
  });
  var motBase = motView==='pinned' ? pinnedCount : motEntries.length;
  document.getElementById('mot-meta').textContent=list.length+' of '+motBase+(motView==='pinned'?' pinned':'')+' entr'+(motBase!==1?'ies':'y');
  var log=document.getElementById('mot-log');
  if(!list.length){
    log.innerHTML='<div class="sit-empty" style="grid-column:1/-1"><div style="font-size:28px;margin-bottom:10px">&#128293;</div>'+
      (motView==='pinned'
        ? (pinnedCount===0?'Nothing pinned yet.<br>Tap &#128204; on any entry to pin it here.':'No pinned entries match this filter.')
        : (motEntries.length===0?'Nothing here yet.<br>Add the first habit or principle you want to read every morning.':'No matches for the current filter.'))+'</div>';
    return;
  }
  log.innerHTML=list.map(motCardHTML).join('');
}

async function delMotEntry(id){
  if(!confirm('Delete this entry?'))return;
  var e=motEntries.find(function(x){return x.id===id;});
  motEntries=motEntries.filter(function(x){return x.id!==id;}); saveMotivation(); renderMotivation();
  if(e&&e.sheetId) await postToSheet({sheet:'Motivation',action:'delete_motivation',sheetId:e.sheetId||''});
  showToast('Deleted.','');
}

function pickMotCat(el){
  document.querySelectorAll('#edit-mot-cat-pills .mcp').forEach(function(b){b.classList.remove('on');b.style.background='';b.style.borderColor='';b.style.color='';});
  el.classList.add('on');
  var col=MOT_CAT_COLORS[el.dataset.val]||'#9A97A0';
  el.style.background=col+'22'; el.style.borderColor=col+'88'; el.style.color=col;
}

function editMotEntry(id){
  var e=motEntries.find(function(x){return x.id===id;}); if(!e)return;
  var catOpts=['habit','practice','principle','mantra','reminder'];
  var catPills=catOpts.map(function(c){
    var col=MOT_CAT_COLORS[c]||'#9A97A0';
    var icon=MOT_CAT_ICONS[c]||'';
    var active=e.category===c;
    var st=active?('background:'+col+'22;border-color:'+col+'88;color:'+col):'';
    return '<button class="mcp'+(active?' on':'')+'" data-val="'+c+'" style="'+st+'" onclick="pickMotCat(this)">'+icon+' '+c+'</button>';
  }).join('');
  var html='<div style="margin-bottom:10px"><label class="sfl">Category</label>'+
    '<div class="mot-cat-pills" id="edit-mot-cat-pills">'+catPills+'</div></div>'+
    '<div><label class="sfl">Habit / practice / principle</label>'+
    '<textarea class="sin" id="edit-mot-text" rows="6">'+escH(e.text)+'</textarea></div>'+
    '<div style="margin-top:10px"><label class="sfl">Real-life example <span style="color:var(--text-3);font-weight:400">(optional)</span></label>'+
    '<textarea class="sin" id="edit-mot-example" rows="3" placeholder="When did this actually happen to you?">'+escH(e.example||'')+'</textarea></div>';
  openEditModal('Edit entry',html,{type:'motivation',id:id});
}

async function fetchAllMotivation(){
  var d=await sheetFetch(WORKER_URL+'?action=getAllMotivation');
  DIAG.motRaw = d ? (d.status+' / '+(Array.isArray(d.motivation)?d.motivation.length+' rows':'no array')) : 'NULL response';
  if(d&&d.status==='ok'&&Array.isArray(d.motivation)) replaceMotivationFromSheet(d.motivation);
  else console.warn('[Motivation] bad response:',d);
}

function replaceMotivationFromSheet(s){
  localStorage.removeItem('morning_motivation');
  var fromSheet=s.map(function(x,i){
    return{id:x.sheetId?parseInt(x.sheetId,10):Date.now()+i,
      timestamp:x.dateISO?new Date(x.dateISO).getTime():Date.now(),
      dateISO:x.dateISO||'',date:x.date||'',
      sheetId:x.sheetId||'',category:x.category||'',
      text:x.text||'',example:x.example||'',pinned:x.pinned==='yes'};
  });
  var sheetIds={};s.forEach(function(x){if(x.sheetId)sheetIds[x.sheetId]=true;});
  var pending=motEntries.filter(function(e){return e.sheetId&&!sheetIds[e.sheetId];});
  motEntries=fromSheet.concat(pending);
  motEntries.sort(function(a,b){if(a.pinned&&!b.pinned)return -1;if(!a.pinned&&b.pinned)return 1;return b.timestamp-a.timestamp;});
  if(document.getElementById('pg-motivation').classList.contains('on'))renderMotivation();
}

function exportMotCSV(){
  if(!motEntries.length){showToast('Nothing to export.','error');return;}
  var h=['Category','Pinned','Entry'];
  var rows=motEntries.map(function(e){return[e.category||'',e.pinned?'yes':'no',e.text||''].map(function(v){return'"'+String(v).replace(/"/g,'""')+'"';}).join(',');});
  var a=document.createElement('a');
  a.href='data:text/csv;charset=utf-8,'+encodeURIComponent([h.join(',')].concat(rows).join('\n'));
  a.download='small-learnings.csv'; a.click(); showToast('CSV exported ✓','success');
}

/* GRATITUDE */
var gratEntries = [];
var selGratEmotion = '';

function loadGratitude(){ try{var r=localStorage.getItem('morning_gratitude');if(r)gratEntries=JSON.parse(r);}catch(e){gratEntries=[];} }
function saveGratitude(){ localStorage.setItem('morning_gratitude',JSON.stringify(gratEntries)); }
function updateGratBadge(){ var el=document.getElementById('grat-badge'); if(el) el.textContent=gratEntries.length; }

function selGratEmo(el){
  document.querySelectorAll('#grat-emo-pills .pep').forEach(function(p){p.classList.remove('on');});
  selGratEmotion=(selGratEmotion===el.dataset.val)?'':el.dataset.val;
  if(selGratEmotion) el.classList.add('on');
}

async function addGratitude(){
  var g1=document.getElementById('grat-1').value.trim();
  var g2=document.getElementById('grat-2').value.trim();
  var g3=document.getElementById('grat-3').value.trim();
  if(!g1&&!g2&&!g3){showToast('Write at least one thing you are grateful for.','error');return;}
  var now=new Date(), gid=String(Date.now());
  var entry={
    id:Date.now(), timestamp:Date.now(), sheetId:gid,
    dateISO:isoDate(now),
    date:now.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}),
    items:[g1,g2,g3].filter(function(x){return x.length>0;}),
    emotion:selGratEmotion
  };
  // Remove any existing entry for today (one per day)
  gratEntries=gratEntries.filter(function(e){return e.dateISO!==entry.dateISO;});
  gratEntries.unshift(entry); saveGratitude();
  // Clear form
  ['grat-1','grat-2','grat-3'].forEach(function(id){document.getElementById(id).value='';});
  selGratEmotion='';
  document.querySelectorAll('#grat-emo-pills .pep').forEach(function(p){p.classList.remove('on');});
  var syncEl=document.getElementById('grat-sync');
  syncEl.textContent='Syncing…'; syncEl.className='sync-txt syncing';
  var ok=await postToSheet({
    sheet:'Gratitude', sheetId:gid,
    date:entry.date, dateISO:entry.dateISO,
    item1:entry.items[0]||'', item2:entry.items[1]||'', item3:entry.items[2]||'',
    emotion:entry.emotion
  });
  syncEl.textContent=ok?'Synced to Sheet ✓':'Saved locally (Sheet unreachable)';
  syncEl.className='sync-txt '+(ok?'ok':'err');
  showToast(ok?'Gratitude saved ✓':'Saved locally — sync failed.',ok?'success':'error');
  updateGratStats(); renderGratitude();
}

var GRAT_EMO_ICONS={grateful:'&#128591;',hopeful:'&#127775;',peaceful:'&#129490;',joyful:'&#128516;',content:'&#129392;',motivated:'&#128293;',calm:'&#129528;'};

function gratCardHTML(e){
  var emoBadge=e.emotion?'<span class="th-emo-badge">'+(GRAT_EMO_ICONS[e.emotion]||'')+' '+e.emotion+'</span>':'';
  var items=e.items.map(function(it){return '<li>'+(ptTile(it,'',{clearOnly:true,size:'sm'})||'<span class="grat-bullet">&#128591;</span>')+'<span>'+escH(it)+'</span></li>';}).join('');
  return '<div class="grat-card">'+
    '<div class="grat-card-date"><div class="grat-streak-dot"></div>'+e.date+emoBadge+'</div>'+
    '<ul class="grat-items">'+items+'</ul>'+
    '<div class="grat-card-foot">'+
      '<button class="del-btn" onclick="delGratEntry('+e.id+')">&#128465; Delete</button>'+
      '<button class="btn" style="font-size:11px;padding:4px 12px" onclick="editGratEntry('+e.id+')">✏ Edit</button>'+
    '</div>'+
  '</div>';
}

function renderGratitude(){
  var search=(document.getElementById('grat-search').value||'').toLowerCase().trim();
  var sort=document.getElementById('grat-sort').value;
  var list=gratEntries.slice();
  if(search) list=list.filter(function(e){return (e.items.join(' ')+e.emotion).toLowerCase().includes(search);});
  if(sort==='oldest') list.sort(function(a,b){return a.timestamp-b.timestamp;});
  else list.sort(function(a,b){return b.timestamp-a.timestamp;});
  document.getElementById('grat-meta').textContent=list.length+' of '+gratEntries.length+' entr'+(gratEntries.length!==1?'ies':'y');
  var log=document.getElementById('grat-log');
  if(!list.length){
    log.innerHTML='<div class="sit-empty"><div style="font-size:28px;margin-bottom:10px">&#128591;</div>'+
      (gratEntries.length===0?'Nothing yet.<br>Add your first three things to be grateful for today.':'No matches.')+'</div>';
    return;
  }
  log.innerHTML=list.map(gratCardHTML).join('');
}

function updateGratStats(){
  var total=gratEntries.length;
  document.getElementById('grat-total-num').textContent=total;
  // Streak
  var streak=0; var today=new Date();
  for(var i=0;i<365;i++){
    var d=new Date(today); d.setDate(today.getDate()-i);
    var iso=isoDate(d);
    var found=gratEntries.find(function(e){return e.dateISO===iso;});
    if(found) streak++;
    else if(i>0) break;
  }
  document.getElementById('grat-streak-num').textContent=streak;
  var todayIso=isoToday();
  var todayEntry=gratEntries.find(function(e){return e.dateISO===todayIso;});
  document.getElementById('grat-today-status').textContent=todayEntry?'✓ Done':'—';
  document.getElementById('grat-today-status').style.color=todayEntry?'var(--green)':'var(--text-3)';
}

function delGratEntry(id){
  if(!confirm('Delete this gratitude entry?'))return;
  var e=gratEntries.find(function(x){return x.id===id;});
  gratEntries=gratEntries.filter(function(x){return x.id!==id;}); saveGratitude();
  if(e&&e.sheetId) postToSheet({sheet:'Gratitude',action:'delete_gratitude',sheetId:e.sheetId||''});
  updateGratStats(); renderGratitude(); showToast('Deleted.','');
}

function editGratEntry(id){
  var e=gratEntries.find(function(x){return x.id===id;}); if(!e)return;
  var emoPills=['grateful','hopeful','peaceful','joyful','content','motivated','calm'].map(function(em){
    return '<button class="pep'+(e.emotion===em?' on':'')+'" data-val="'+em+'" onclick="this.parentNode.querySelectorAll(\'.pep\').forEach(function(x){x.classList.remove(\'on\')});this.classList.add(\'on\')">'+(GRAT_EMO_ICONS[em]||'')+' '+em+'</button>';
  }).join('');
  var html=
    '<div class="grat-input-row" style="margin-bottom:6px"><div class="grat-num">1</div><textarea class="sin" id="edit-grat-1" rows="2">'+escH(e.items[0]||'')+'</textarea></div>'+
    '<div class="grat-input-row" style="margin-bottom:6px"><div class="grat-num">2</div><textarea class="sin" id="edit-grat-2" rows="2">'+escH(e.items[1]||'')+'</textarea></div>'+
    '<div class="grat-input-row" style="margin-bottom:10px"><div class="grat-num">3</div><textarea class="sin" id="edit-grat-3" rows="2">'+escH(e.items[2]||'')+'</textarea></div>'+
    '<label class="sfl">Feeling</label><div class="pemo-pills" id="edit-grat-emo-pills">'+emoPills+'</div>';
  openEditModal('Edit gratitude entry',html,{type:'gratitude',id:id});
}

function exportGratCSV(){
  if(!gratEntries.length){showToast('Nothing to export.','error');return;}
  var h=['Date','Grateful for 1','Grateful for 2','Grateful for 3','Emotion'];
  var rows=gratEntries.map(function(e){
    return[e.date,e.items[0]||'',e.items[1]||'',e.items[2]||'',e.emotion||'']
      .map(function(v){return '"'+String(v).replace(/"/g,'""')+'"';}).join(',');
  });
  var a=document.createElement('a');
  a.href='data:text/csv;charset=utf-8,'+encodeURIComponent([h.join(',')].concat(rows).join('\n'));
  a.download='gratitude-'+isoToday()+'.csv'; a.click();
  showToast('CSV exported ✓','success');
}

async function fetchAllGratitude(){
  var d=await sheetFetch(WORKER_URL+'?action=getAllGratitude');
  DIAG.gratRaw = d ? (d.status+' / '+(Array.isArray(d.gratitude)?d.gratitude.length+' rows':'no array')) : 'NULL response';
  if(d&&d.status==='ok'&&Array.isArray(d.gratitude)) replaceGratitudeFromSheet(d.gratitude);
  else console.warn('[Gratitude] bad response:',d);
}

function replaceGratitudeFromSheet(s){
  localStorage.removeItem('morning_gratitude');
  var fromSheet=s.map(function(x,i){
    return{
      id:x.sheetId?parseInt(x.sheetId,10):Date.now()+i,
      timestamp:x.dateISO?new Date(x.dateISO).getTime():Date.now(),
      dateISO:x.dateISO||'', date:x.date||'',
      sheetId:x.sheetId||'', emotion:x.emotion||'',
      items:[x.item1||'',x.item2||'',x.item3||''].filter(function(v){return v.length>0;})
    };
  });
  var sheetIds={};s.forEach(function(x){if(x.sheetId)sheetIds[x.sheetId]=true;});
  var pending=gratEntries.filter(function(e){return e.sheetId&&!sheetIds[e.sheetId];});
  gratEntries=fromSheet.concat(pending);
  gratEntries.sort(function(a,b){return b.timestamp-a.timestamp;});
  updateGratStats(); updateGratBadge();
  fillMorningGratitude();
  if(document.getElementById('pg-gratitude').classList.contains('on')) renderGratitude();
}

/* MORNING GRATITUDE LINK */
/* Pre-fill morning gratitude inputs with today's entry from Sheet */
function normISO(d){
  if(!d) return '';
  var s=String(d).trim();
  // Already YYYY-MM-DD
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Try parsing anything else (ISO timestamp, locale string, Date object)
  var dt=new Date(s);
  if(isNaN(dt.getTime())) return s;
  return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0');
}

function fillMorningGratitude(){
  var todayIso=isoToday();
  var todayEntry=gratEntries.find(function(e){return normISO(e.dateISO)===todayIso;});
  DIAG.gratToday = todayEntry ? 'FOUND' : 'none for '+todayIso;
  DIAG.gratDates = gratEntries.map(function(e){return normISO(e.dateISO);}).join(', ');
  var i1=document.getElementById('morning-grat-1');
  var i2=document.getElementById('morning-grat-2');
  var i3=document.getElementById('morning-grat-3');
  if(!i1) return;   // section no longer on the home page
  var syncEl=document.getElementById('morning-grat-sync');
  if(!i1||!i2||!i3) return;
  if(todayEntry){
    i1.value=(todayEntry.items&&todayEntry.items[0])||'';
    i2.value=(todayEntry.items&&todayEntry.items[1])||'';
    i3.value=(todayEntry.items&&todayEntry.items[2])||'';
    if(syncEl){syncEl.textContent='Loaded from Sheet \u2713';syncEl.className='sync-txt ok';}
  }else{
    i1.value=''; i2.value=''; i3.value='';
    if(syncEl){syncEl.textContent='No entry saved for today yet';syncEl.className='sync-txt';}
  }
}

async function saveMorningGratitude(){
  var _mg=document.getElementById('morning-grat-1'); if(!_mg) return;
  var g1=_mg.value.trim();
  var g2=document.getElementById('morning-grat-2').value.trim();
  var g3=document.getElementById('morning-grat-3').value.trim();
  if(!g1&&!g2&&!g3){showToast('Write at least one thing you are grateful for.','error');return;}
  var now=new Date(), gid=String(Date.now());
  var entry={id:Date.now(),timestamp:Date.now(),sheetId:gid,
    dateISO:isoDate(now),date:now.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}),
    items:[g1,g2,g3].filter(function(x){return x.length>0;}),
    emotion:'grateful'};
  // Remove any existing entry for today
  gratEntries=gratEntries.filter(function(e){return e.dateISO!==entry.dateISO;});
  gratEntries.unshift(entry); saveGratitude(); updateGratStats();
  // Sync to Sheet
  var syncEl=document.getElementById('morning-grat-sync');
  syncEl.textContent='Syncing…'; syncEl.className='sync-txt syncing';
  var ok=await postToSheet({sheet:'Gratitude',sheetId:gid,date:entry.date,dateISO:entry.dateISO,
    item1:entry.items[0]||'',item2:entry.items[1]||'',item3:entry.items[2]||'',emotion:'grateful'});
  syncEl.textContent=ok?'Saved to Gratitude tab ✓':'Saved locally (Sheet unreachable)';
  syncEl.className='sync-txt '+(ok?'ok':'err');
  showToast(ok?'Gratitude saved ✓':'Saved locally.', ok?'success':'error');
  // Keep values visible so you can see what was saved
}

/* ═══════════════════════════════════════════════════
   DAILY HABITS — Sheet is the source of truth

   TodayHabits sheet holds one row per day:
     Date | Date ISO | Habits | Saved At
   where Habits is "[✓] text | [ ] text | ..."

   On every load we rebuild from those rows:
     habitList    — habits in the most recent row
     habitDone    — {dateISO: [text, ...]} ticked per day
     habitArchive — seen in older rows, dropped since

   Habits are keyed by TEXT so state survives the
   round-trip through the Sheet with no local IDs.
═══════════════════════════════════════════════════ */
var habitList=[];      // [text, ...] currently followed
var habitDone={};      // {dateISO: [text, ...]}
var habitArchive=[];   // [text, ...] previously followed

/* "[✓] Wait 30s | [ ] Read" → [{text, done}] */
function parseHabitCell(cell){
  if(!cell) return [];
  return String(cell).split('|').map(function(part){
    var s=part.trim(); if(!s) return null;
    var done=/^\[\s*[\u2713xX]\s*\]/.test(s);
    return { text:s.replace(/^\[[^\]]*\]\s*/,'').trim(), done:done };
  }).filter(function(x){ return x && x.text; });
}

async function fetchAllTodayHabits(){
  var d=await sheetFetch(WORKER_URL+'?action=getAllTodayHabits');
  DIAG.habRaw = d ? (d.status+' / '+(Array.isArray(d.todayHabits)?d.todayHabits.length+' rows':'no array')) : 'NULL response';
  if(d&&d.status==='ok'&&Array.isArray(d.todayHabits)) replaceHabitsFromSheet(d.todayHabits);
  else console.warn('[TodayHabits] bad response:',d);
}

function replaceHabitsFromSheet(rows){
  localStorage.removeItem('habit_list');
  localStorage.removeItem('habit_done');
  localStorage.removeItem('habit_archive');
  habitList=[]; habitDone={}; habitArchive=[];
  if(!rows.length){ renderTodayHabits(); return; }

  rows.sort(function(a,b){ return (a.dateISO||'').localeCompare(b.dateISO||''); });

  var seenEver=[];
  rows.forEach(function(r){
    var parsed=parseHabitCell(r.habits);
    habitDone[r.dateISO]=parsed.filter(function(h){return h.done;}).map(function(h){return h.text;});
    parsed.forEach(function(h){ if(seenEver.indexOf(h.text)===-1) seenEver.push(h.text); });
  });

  var latest=rows[rows.length-1];
  habitList=parseHabitCell(latest.habits).map(function(h){return h.text;});
  habitArchive=seenEver.filter(function(t){ return habitList.indexOf(t)===-1; }).slice(0,12);

  DIAG.habLoaded=habitList.length+' active, '+habitArchive.length+' archived, '+Object.keys(habitDone).length+' days';
  renderTodayHabits();
}

function saveTodayHabits(){
  var now=new Date(), today=isoToday();
  var doneToday=habitDone[today]||[];
  var text=habitList.map(function(t){
    return (doneToday.indexOf(t)>-1?'[\u2713] ':'[ ] ')+t;
  }).join(' | ');
  var syncEl=document.getElementById('hab-day-sync');
  if(syncEl){ syncEl.textContent='Syncing\u2026'; syncEl.className='sync-txt syncing'; }
  return postToSheet({
    sheet:'TodayHabits',
    date:now.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}),
    dateISO:today,
    habits:text
  }).then(function(ok){
    DIAG.habSync = ok ? 'OK \u2014 written to TodayHabits' : 'FAILED \u2014 script rejected or unreachable';
    if(syncEl){
      syncEl.textContent=ok?'Saved to Sheet \u2713':'Sheet sync failed';
      syncEl.className='sync-txt '+(ok?'ok':'err');
    }
    return ok;
  });
}

function habitStreak(text){
  var streak=0, d=new Date();
  for(var i=0;i<365;i++){
    var iso=isoDate(d);
    if((habitDone[iso]||[]).indexOf(text)>-1) streak++;
    else if(i>0) break;
    d.setDate(d.getDate()-1);
  }
  return streak;
}

function renderTodayHabits(){
  var el=document.getElementById('today-habits-list');
  if(!el) return;
  var doneToday=habitDone[isoToday()]||[];

  if(!habitList.length){
    el.innerHTML='<div style="font-size:12px;color:var(--text-3);padding:6px 0">'+
      'No habits yet \u2014 add one below. It stays on your list every day until you remove it.</div>';
    renderHabitArchive(); return;
  }

  el.innerHTML=habitList.map(function(t,idx){
    var done=doneToday.indexOf(t)>-1;
    var s=habitStreak(t);
    var streakHtml = s>1 ? '<span class="hab-streak">\ud83d\udd25 '+s+'d</span>'
      : (s===1 ? '<span class="hab-streak" style="color:var(--green);border-color:rgba(107,191,142,0.3);background:rgba(107,191,142,0.08)">day 1</span>' : '');
    var esc=escH(t).replace(/'/g,"\\'");
    return '<div class="th-habit-item" data-habit="'+escH(t)+'" data-idx="'+idx+'">'+
      '<span class="th-habit-grip" onpointerdown="startHabitDrag(event,'+idx+')" title="Drag to reorder">\u2630</span>'+
      '<div class="th-habit-cb'+(done?' done':'')+'" onclick="toggleTodayHabit(\''+esc+'\')"><span class="th-habit-tick">\u2713</span></div>'+
      ptTile(t,'',{clearOnly:true,size:'sm'})+
      '<span class="th-habit-text" onclick="toggleTodayHabit(\''+esc+'\')">'+escH(t)+'</span>'+
      streakHtml+
      '<button class="th-habit-edit" onclick="editTodayHabit(\''+esc+'\')" title="Edit wording">\u270e</button>'+
      '<button class="th-habit-del" onclick="removeTodayHabit(\''+esc+'\')" title="Stop following">\u00d7</button>'+
    '</div>';
  }).join('');
  renderHabitArchive();
  if(window.updateSectionBadges) updateSectionBadges();
}

function renderHabitArchive(){
  var box=document.getElementById('habit-archive-box');
  if(!box) return;
  if(!habitArchive.length){ box.style.display='none'; return; }
  box.style.display='block';
  box.innerHTML='<div style="font-size:10px;font-family:var(--fm);color:var(--text-3);letter-spacing:0.1em;text-transform:uppercase;margin:10px 0 6px">Previously followed</div>'+
    '<div style="display:flex;flex-wrap:wrap;gap:5px">'+
    habitArchive.map(function(t){
      var esc=escH(t).replace(/'/g,"\\'");
      return '<button class="hab-chip" onclick="restoreHabit(\''+esc+'\')">+ '+escH(t)+'</button>';
    }).join('')+'</div>';
}

function editTodayHabit(text){
  var streak=habitStreak(text);
  var note = streak>0
    ? '<div style="font-size:11px;color:var(--text-3);margin-top:8px;line-height:1.6">Your '+streak+
      '-day streak is preserved \u2014 the wording is updated everywhere in the Sheet, including past days.</div>'
    : '<div style="font-size:11px;color:var(--text-3);margin-top:8px;line-height:1.6">The wording is updated everywhere in the Sheet, including past days.</div>';
  var html='<label class="sfl">Habit wording</label>'+
    '<textarea class="sin" id="edit-habit-text" rows="3">'+escH(text)+'</textarea>'+note;
  openEditModal('Edit habit',html,{type:'habit',oldText:text});
}

/* ── Drag-to-reorder for the habit list ───────────────────
   Pointer Events cover mouse and touch with one path.
   The list order is the order written to the Sheet, so
   committing a reorder is just a re-save.
──────────────────────────────────────────────────────── */
var _hDrag=null;

function startHabitDrag(ev,idx){
  ev.preventDefault();
  var row=ev.target.closest('.th-habit-item');
  if(!row) return;
  _hDrag={from:idx,to:idx,row:row,moved:false};
  row.classList.add('dragging');
  try{ ev.target.setPointerCapture(ev.pointerId); }catch(e){}
  document.addEventListener('pointermove',onHabitDragMove);
  document.addEventListener('pointerup',endHabitDrag);
  document.addEventListener('pointercancel',endHabitDrag);
}

function onHabitDragMove(ev){
  if(!_hDrag) return;
  var list=document.getElementById('today-habits-list');
  if(!list) return;
  var rows=Array.prototype.slice.call(list.querySelectorAll('.th-habit-item'));

  rows.forEach(function(r){ r.classList.remove('drag-over','drag-over-below'); });

  var target=null, below=false;
  for(var i=0;i<rows.length;i++){
    var b=rows[i].getBoundingClientRect();
    if(ev.clientY>=b.top && ev.clientY<=b.bottom){
      target=i; below=ev.clientY > b.top + b.height/2; break;
    }
    if(i===rows.length-1 && ev.clientY>b.bottom){ target=i; below=true; }
    if(i===0 && ev.clientY<b.top){ target=0; below=false; }
  }
  if(target===null) return;

  var dest=below?target+1:target;
  if(dest>_hDrag.from) dest--;
  dest=Math.max(0,Math.min(habitList.length-1,dest));
  _hDrag.to=dest;
  _hDrag.moved=true;

  if(rows[target] && target!==_hDrag.from){
    rows[target].classList.add(below?'drag-over-below':'drag-over');
  }
}

function endHabitDrag(){
  document.removeEventListener('pointermove',onHabitDragMove);
  document.removeEventListener('pointerup',endHabitDrag);
  document.removeEventListener('pointercancel',endHabitDrag);
  if(!_hDrag){ return; }
  var d=_hDrag; _hDrag=null;

  var list=document.getElementById('today-habits-list');
  if(list) list.querySelectorAll('.th-habit-item').forEach(function(r){
    r.classList.remove('dragging','drag-over','drag-over-below');
  });

  if(!d.moved || d.to===d.from){ renderTodayHabits(); return; }

  var moved=habitList.splice(d.from,1)[0];
  habitList.splice(d.to,0,moved);
  renderTodayHabits();
  saveTodayHabits();
  showToast('Order updated \u2713','success');
}

function addTodayHabit(){
  var inp=document.getElementById('today-habit-input');
  var text=(inp.value||'').trim(); if(!text) return;
  if(habitList.some(function(t){return t.toLowerCase()===text.toLowerCase();})){
    showToast('That habit is already on your list.','error'); inp.value=''; return;
  }
  var archived=habitArchive.filter(function(t){return t.toLowerCase()===text.toLowerCase();})[0];
  if(archived){ restoreHabit(archived); inp.value=''; return; }
  habitList.push(text);
  saveTodayHabits(); renderTodayHabits();
  inp.value=''; inp.focus();
}

function toggleTodayHabit(text){
  var today=isoToday();
  if(!habitDone[today]) habitDone[today]=[];
  var i=habitDone[today].indexOf(text);
  if(i>-1) habitDone[today].splice(i,1); else habitDone[today].push(text);
  saveTodayHabits(); renderTodayHabits();
}

function removeTodayHabit(text){
  if(!confirm('Stop following "'+text+'"?\n\nIt moves to "Previously followed" so you can re-add it anytime.')) return;
  habitList=habitList.filter(function(t){return t!==text;});
  if(habitArchive.indexOf(text)===-1) habitArchive.unshift(text);
  if(habitArchive.length>12) habitArchive=habitArchive.slice(0,12);
  saveTodayHabits(); renderTodayHabits();
  showToast('Moved to previously followed.','');
}

function restoreHabit(text){
  habitArchive=habitArchive.filter(function(t){return t!==text;});
  if(habitList.indexOf(text)===-1) habitList.push(text);
  saveTodayHabits(); renderTodayHabits();
  showToast('Following again \u2713','success');
}

function clearTodayHabits(){
  if(!habitList.length) return;
  if(!confirm("Untick all habits for today?\n\nYour habit list stays \u2014 this only clears today's ticks.")) return;
  habitDone[isoToday()]=[];
  saveTodayHabits(); renderTodayHabits();
}

/* MORNING GRATITUDE LINK */
/* Pre-fill morning gratitude inputs with today's entry from Sheet */
/* ═══════════════════════════════════════════════════
   KUNDALI LEARNINGS — Sheet is the source of truth
   Keyed by sheetId so edits always find the right row.
═══════════════════════════════════════════════════ */
var kunEntries=[];
var selKunCategory='';
var kunCatFilter='all';
var kunView='pinned';  // 'all' | 'pinned' — Pinned opens first

var KUN_CAT_COLORS={health:'#6BBF8E',career:'#C9A84C',finances:'#4ECDC4',relationships:'#E07B7B',
  family:'#d98cb3',property:'#8b9dc3',education:'#b0a0d6',spiritual:'#e0c068',timing:'#9A97A0',general:'#7fb3d5'};
var KUN_CAT_ICONS={health:'&#127807;',career:'&#128188;',finances:'&#128176;',relationships:'&#128149;',
  family:'&#128106;',property:'&#127968;',education:'&#128218;',spiritual:'&#128329;',timing:'&#8987;',general:'&#10024;'};

function selKunCat(el){
  document.querySelectorAll('.kun-cat-pills .kcp').forEach(function(p){
    p.classList.remove('on'); p.style.background=''; p.style.borderColor=''; p.style.color='';
  });
  selKunCategory=(selKunCategory===el.dataset.val)?'':el.dataset.val;
  if(selKunCategory){
    el.classList.add('on');
    var c=KUN_CAT_COLORS[selKunCategory]||'#C9A84C';
    el.style.background=c+'22'; el.style.borderColor=c+'88'; el.style.color=c;
  }
}

function setKunView(v){
  kunView=v;
  document.getElementById('kun-tab-pinned').classList.toggle('on',v==='pinned');
  document.getElementById('kun-tab-all').classList.toggle('on',v==='all');
  renderKundali();
}

async function toggleKunPin(id){
  var e=kunEntries.find(function(x){return x.id===id;}); if(!e) return;
  e.pinned=!e.pinned;
  renderKundali();
  var ok=await postToSheet({sheet:'Kundali',action:'pin_kundali',sheetId:e.sheetId||'',pinned:e.pinned?'yes':'no'});
  showToast(ok?(e.pinned?'Pinned \u2713':'Unpinned'):'Sync failed \u2014 pin not saved.',ok?'success':'error');
}

function setKunCatFilter(el){
  document.querySelectorAll('#kun-cat-filter .ef').forEach(function(p){p.classList.remove('on');});
  el.classList.add('on'); kunCatFilter=el.dataset.kc; renderKundali();
}

async function addKundali(){
  var learning=document.getElementById('kun-learning').value.trim();
  var logic=document.getElementById('kun-logic').value.trim();
  if(!learning){showToast('Write the learning first.','error');return;}
  if(!selKunCategory){showToast('Pick a category first.','error');return;}
  var now=new Date(), kid=String(Date.now());
  var e={id:Date.now(),timestamp:Date.now(),sheetId:kid,
    dateISO:isoDate(now),date:now.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}),
    category:selKunCategory,learning:learning,logic:logic,pinned:false};
  kunEntries.unshift(e);

  document.getElementById('kun-learning').value='';
  document.getElementById('kun-logic').value='';
  selKunCategory='';
  document.querySelectorAll('.kun-cat-pills .kcp').forEach(function(p){p.classList.remove('on');p.style.background='';p.style.borderColor='';p.style.color='';});

  var syncEl=document.getElementById('kun-sync');
  syncEl.textContent='Syncing\u2026'; syncEl.className='sync-txt syncing';
  var ok=await postToSheet({sheet:'Kundali',sheetId:kid,date:e.date,dateISO:e.dateISO,
    category:e.category,learning:e.learning,logic:e.logic});
  syncEl.textContent=ok?'Saved to Sheet \u2713':'Saved locally (Sheet unreachable)';
  syncEl.className='sync-txt '+(ok?'ok':'err');
  showToast(ok?'Learning saved \u2713':'Saved locally \u2014 sync failed.',ok?'success':'error');
  if(ok) await fetchAllKundali();   // pull back so UI matches the Sheet exactly
  renderKundali();
}

function kunCardHTML(e){
  var col=KUN_CAT_COLORS[e.category]||'#9A97A0';
  var icon=KUN_CAT_ICONS[e.category]||'';
  var label=e.category?e.category.charAt(0).toUpperCase()+e.category.slice(1):'';
  return '<div class="kun-card'+(e.pinned?' pinned':'')+'">'+
    '<div class="kun-card-head">'+
      '<span class="kun-cat" style="background:'+col+'1f;border:1px solid '+col+'55;color:'+col+'">'+icon+' '+label+'</span>'+
      '<span class="kun-date">'+e.date+'</span>'+
      '<button class="pst-pin'+(e.pinned?' on':'')+'" onclick="toggleKunPin('+e.id+')" title="'+(e.pinned?'Unpin':'Pin')+'">&#128204;</button>'+
    '</div>'+
    '<div class="pt-row">'+ptTile(e.learning,e.logic,{clearOnly:true,size:'md'})+'<div class="kun-learning pt-fill">'+escH(e.learning)+'</div></div>'+
    (e.logic?'<div class="kun-logic-lbl">Logic</div><div class="kun-logic">'+escH(e.logic)+'</div>':'')+
    '<div class="kun-card-foot">'+
      '<button class="del-btn" onclick="delKundali('+e.id+')">&#128465; Delete</button>'+
      '<button class="btn" style="font-size:11px;padding:4px 12px" onclick="editKundali('+e.id+')">\u270e Edit</button>'+
    '</div>'+
  '</div>';
}

function renderKundali(){
  var searchEl=document.getElementById('kun-search');
  if(!searchEl) return;
  var search=(searchEl.value||'').toLowerCase().trim();
  var sort=document.getElementById('kun-sort').value;
  var kunPinned=kunEntries.filter(function(e){return e.pinned;}).length;
  var kcp=document.getElementById('kun-ct-pinned'); if(kcp) kcp.textContent=kunPinned;
  var kca=document.getElementById('kun-ct-all');    if(kca) kca.textContent=kunEntries.length;

  var list=kunEntries.slice();
  if(kunView==='pinned') list=list.filter(function(e){return e.pinned;});
  if(kunCatFilter!=='all') list=list.filter(function(e){return e.category===kunCatFilter;});
  if(search) list=list.filter(function(e){
    return ((e.learning||'')+(e.logic||'')+(e.category||'')).toLowerCase().includes(search);
  });
  if(sort==='oldest') list.sort(function(a,b){return a.timestamp-b.timestamp;});
  else if(sort==='category') list.sort(function(a,b){return (a.category||'').localeCompare(b.category||'');});
  else list.sort(function(a,b){return b.timestamp-a.timestamp;});

  var kunBase = kunView==='pinned' ? kunPinned : kunEntries.length;
  document.getElementById('kun-meta').textContent=list.length+' of '+kunBase+(kunView==='pinned'?' pinned':'')+' learning'+(kunBase!==1?'s':'');
  var log=document.getElementById('kun-log');
  if(!list.length){
    log.innerHTML='<div class="sit-empty"><div style="font-size:28px;margin-bottom:10px">&#128337;</div>'+
      (kunView==='pinned'
        ? (kunPinned===0?'Nothing pinned yet.<br>Tap &#128204; on any learning to pin it here.':'No pinned learnings match this filter.')
        : (kunEntries.length===0?'Nothing recorded yet.<br>Add your first Kundali learning below.':'No matches for this filter.'))+'</div>';
    return;
  }
  log.innerHTML=list.map(kunCardHTML).join('');
}

async function delKundali(id){
  if(!confirm('Delete this learning?'))return;
  var e=kunEntries.find(function(x){return x.id===id;});
  kunEntries=kunEntries.filter(function(x){return x.id!==id;});
  renderKundali();
  if(e&&e.sheetId){
    var ok=await postToSheet({sheet:'Kundali',action:'delete_kundali',sheetId:e.sheetId});
    if(ok) await fetchAllKundali();
    renderKundali();
  }
  showToast('Deleted.','');
}

function editKundali(id){
  var e=kunEntries.find(function(x){return x.id===id;}); if(!e)return;
  var cats=['health','career','finances','relationships','family','property','education','spiritual','timing','general'];
  var pills=cats.map(function(c){
    var col=KUN_CAT_COLORS[c]||'#9A97A0';
    var active=e.category===c;
    var st=active?('background:'+col+'22;border-color:'+col+'88;color:'+col):'';
    return '<button class="kcp'+(active?' on':'')+'" data-val="'+c+'" style="'+st+'" onclick="pickKunCat(this)">'+(KUN_CAT_ICONS[c]||'')+' '+c+'</button>';
  }).join('');
  var html='<div style="margin-bottom:10px"><label class="sfl">Category</label>'+
    '<div class="kun-cat-pills" id="edit-kun-cat-pills">'+pills+'</div></div>'+
    '<div style="margin-bottom:10px"><label class="sfl">The learning</label>'+
    '<textarea class="sin" id="edit-kun-learning" rows="4">'+escH(e.learning||'')+'</textarea></div>'+
    '<div><label class="sfl">The logic behind it</label>'+
    '<textarea class="sin" id="edit-kun-logic" rows="5">'+escH(e.logic||'')+'</textarea></div>';
  openEditModal('Edit learning',html,{type:'kundali',id:id});
}

function pickKunCat(el){
  document.querySelectorAll('#edit-kun-cat-pills .kcp').forEach(function(b){
    b.classList.remove('on'); b.style.background=''; b.style.borderColor=''; b.style.color='';
  });
  el.classList.add('on');
  var c=KUN_CAT_COLORS[el.dataset.val]||'#C9A84C';
  el.style.background=c+'22'; el.style.borderColor=c+'88'; el.style.color=c;
}

function exportKunCSV(){
  if(!kunEntries.length){showToast('Nothing to export.','error');return;}
  var h=['Date','Category','Learning','Logic'];
  var rows=kunEntries.map(function(e){
    return [e.date,e.category||'',e.learning||'',e.logic||'']
      .map(function(v){return '"'+String(v).replace(/"/g,'""')+'"';}).join(',');
  });
  var a=document.createElement('a');
  a.href='data:text/csv;charset=utf-8,'+encodeURIComponent([h.join(',')].concat(rows).join('\n'));
  a.download='kundali-'+isoToday()+'.csv'; a.click();
  showToast('CSV exported \u2713','success');
}

async function fetchAllKundali(){
  var d=await sheetFetch(WORKER_URL+'?action=getAllKundali');
  DIAG.kunRaw = d ? (d.status+' / '+(Array.isArray(d.kundali)?d.kundali.length+' rows':'no array')) : 'NULL response';
  if(d&&d.status==='ok'&&Array.isArray(d.kundali)) replaceKundaliFromSheet(d.kundali);
  else console.warn('[Kundali] bad response:',d);
}

function replaceKundaliFromSheet(s){
  localStorage.removeItem('morning_kundali');
  kunEntries=s.map(function(x,i){
    return {
      id:       x.sheetId?parseInt(x.sheetId,10):Date.now()+i,
      timestamp:x.dateISO?new Date(x.dateISO).getTime():Date.now(),
      dateISO:  x.dateISO  || '',
      date:     x.date     || '',
      sheetId:  x.sheetId  || '',
      category: x.category || '',
      learning: x.learning || '',
      logic:    x.logic    || '',
      pinned:   String(x.pinned||'').toLowerCase()==='yes',
    };
  });
  kunEntries.sort(function(a,b){return b.timestamp-a.timestamp;});
  renderKundali();
}

/* ═══════════════════════════════════════════════════
   IMAGE UPLOAD — ImgBB, same setup as Inner Compass

   Base64 + FormData is what that page uses and it works, so
   this mirrors it rather than inventing a second approach.
   Each upload stores "fullUrl|thumbUrl" so cards can render
   the light thumbnail and the lightbox the full image.
═══════════════════════════════════════════════════ */
var IMGBB_KEY='eb426f1db804774ed1a4a3926acf2a2d';

/* Upload one file, resolve to {url, thumb} */
function uploadToImgbb(file){
  return new Promise(function(resolve,reject){
    var reader=new FileReader();
    reader.onerror=function(){ reject(new Error('Could not read the file')); };
    reader.onload=function(ev){
      var base64=String(ev.target.result).split(',')[1];
      var fd=new FormData();
      fd.append('key',IMGBB_KEY);
      fd.append('image',base64);
      fetch('https://api.imgbb.com/1/upload',{method:'POST',body:fd})
        .then(function(r){ return r.json(); })
        .then(function(d){
          if(d&&d.success&&d.data&&d.data.url){
            resolve({url:d.data.url, thumb:(d.data.thumb&&d.data.thumb.url)||d.data.url});
          }else{
            reject(new Error((d&&d.error&&(d.error.message||d.error))||'Upload rejected'));
          }
        })
        .catch(reject);
    };
    reader.readAsDataURL(file);
  });
}

/* Upload a batch, appending each result to the hidden field */
async function handleUpload(files,taId,progId,thumbId){
  if(!files||!files.length) return;
  var ta=document.getElementById(taId);
  var prog=document.getElementById(progId);
  var list=Array.prototype.slice.call(files).filter(function(f){ return /^image\//.test(f.type); });
  if(!list.length){ if(prog){prog.textContent='Those files are not images.';prog.className='up-prog err';} return; }

  var sfx=progId.replace('up-prog-','');
  var bar=document.getElementById('up-bar-'+sfx), fill=document.getElementById('up-bar-fill-'+sfx);
  if(bar) bar.classList.add('on');

  var done=0, failed=0, lastErr='';
  for(var i=0;i<list.length;i++){
    if(prog){ prog.textContent='Uploading '+(i+1)+' of '+list.length+'\u2026'; prog.className='up-prog'; }
    if(fill) fill.style.width=Math.round(i/list.length*100)+'%';
    try{
      var r=await uploadToImgbb(list[i]);
      ta.value=(ta.value.trim()?ta.value.trim()+'\n':'')+r.url+'|'+r.thumb;
      done++;
      renderUploadThumbs(taId,thumbId);
    }catch(err){
      failed++; lastErr=err.message||String(err);
      console.warn('[imgbb]',lastErr);
    }
  }
  if(fill) fill.style.width='100%';
  if(prog){
    prog.textContent = failed ? done+' uploaded, '+failed+' failed \u2014 '+lastErr
                              : done+' image'+(done!==1?'s':'')+' uploaded \u2713';
    prog.className='up-prog '+(failed?'err':'ok');
  }
  setTimeout(function(){ if(bar) bar.classList.remove('on'); if(fill) fill.style.width='0'; },1800);
}

/* Thumbnails of what's attached, each removable */
function renderUploadThumbs(taId,thumbId){
  var ta=document.getElementById(taId), box=document.getElementById(thumbId);
  if(!ta||!box) return;
  var imgs=parseImgs(ta.value);
  box.innerHTML=imgs.map(function(im,i){
    return '<div class="up-thumb"><img src="'+escH(im.thumb)+'" alt="" onerror="this.style.opacity=.25">'+
      '<button class="up-thumb-x" onclick="removeUploadImg(\''+taId+'\',\''+thumbId+'\','+i+')" title="Remove">\u00d7</button></div>';
  }).join('');
}

function removeUploadImg(taId,thumbId,idx){
  var ta=document.getElementById(taId); if(!ta) return;
  var lines=String(ta.value||'').split(/\n/).map(function(x){return x.trim();}).filter(Boolean);
  lines.splice(idx,1);
  ta.value=lines.join('\n');
  renderUploadThumbs(taId,thumbId);
}

function wireDropZone(zoneId,taId,progId,thumbId){
  var z=document.getElementById(zoneId); if(!z||z._wired) return;
  z._wired=true;
  ['dragenter','dragover'].forEach(function(ev){
    z.addEventListener(ev,function(e){ e.preventDefault(); z.classList.add('drag'); });
  });
  ['dragleave','drop'].forEach(function(ev){
    z.addEventListener(ev,function(e){ e.preventDefault(); z.classList.remove('drag'); });
  });
  z.addEventListener('drop',function(e){
    if(e.dataTransfer&&e.dataTransfer.files) handleUpload(e.dataTransfer.files,taId,progId,thumbId);
  });
}

/* Paste a screenshot straight in */
document.addEventListener('paste',function(e){
  if(!e.clipboardData||!e.clipboardData.files||!e.clipboardData.files.length) return;
  var modalOpen=document.getElementById('edit-modal').style.display==='block';
  if(modalOpen && document.getElementById('edit-post-imgs')){
    handleUpload(e.clipboardData.files,'edit-post-imgs','up-prog-edit','up-thumbs-edit');
  }else if(document.getElementById('pg-posts').classList.contains('on')){
    handleUpload(e.clipboardData.files,'post-imgs','up-prog-new','up-thumbs-new');
  }
});

/* ── One habit + one video ───────────────────────────────
   Both CARRY FORWARD: whatever you last set stays on screen
   every day until you change it. Each field carries forward
   independently, so changing the video doesn't disturb the
   habit. Changing either stamps today's row, and that becomes
   the value carried into the days after.
──────────────────────────────────────────────────────── */
var dailyFocus={};          // {dateISO: {focus, videoUrl, videoNote}}
var _dfTimer=null, _dfLast='';
var _dvTimer=null, _dvLast='';

/* Most recent non-empty value for a field, at or before a date */
function carriedValue(field,iso){
  var keys=Object.keys(dailyFocus).filter(function(k){ return k<=iso; }).sort();
  for(var i=keys.length-1;i>=0;i--){
    var v=(dailyFocus[keys[i]]||{})[field];
    if(v&&String(v).trim()) return {value:String(v).trim(), since:keys[i]};
  }
  return {value:'', since:''};
}

function carryNote(since,iso){
  if(!since||since===iso) return '';
  var p=since.split('-'), d=new Date(+p[0],+p[1]-1,+p[2]);
  var days=Math.round((new Date(iso)-d)/86400000);
  return 'Set '+d.toLocaleDateString('en-IN',{day:'numeric',month:'short'})+
         ' \u00b7 carried '+days+' day'+(days!==1?'s':'');
}

function autoGrowFocus(el){
  if(!el) return;
  el.style.height='auto';
  el.style.height=(el.scrollHeight)+'px';
}

/* YouTube thumbnail, where we can derive one */
function ytThumb(url){
  var m=String(url||'').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
  return m?'https://img.youtube.com/vi/'+m[1]+'/mqdefault.jpg':'';
}

/* ═══════════════════════════════════════════════════
   SITUATION PLANS — "when X, I will do Y"

   sitPlans : library of plans, active or retired. Retiring keeps
              a plan's outcome history rather than discarding it.
   sitLog   : {dateISO: {planId: {c:1, f:1}}}
              c = the situation came up   f = I followed the plan

   The home page shows the first 5 ACTIVE plans in order. Marking
   outcomes turns a reminder into feedback: follow-through rate is
   what tells you whether an approach is wrong or merely hard.
═══════════════════════════════════════════════════ */
var sitPlans=[];
var sitLog={};
var planView='active';
var HOME_PLAN_SLOTS=5;

function activePlans(){
  return sitPlans.filter(function(p){ return p.status==='active'; })
                 .sort(function(a,b){ return a.order-b.order; });
}
function homePlans(){ return activePlans().slice(0,HOME_PLAN_SLOTS); }
function planById(id){ return sitPlans.find(function(p){ return p.sheetId===id; }); }

function marksFor(iso){ return sitLog[iso]||{}; }
function markOf(iso,id){ return (sitLog[iso]&&sitLog[iso][id])||{}; }

/* Follow-through over a window: of the days it came up, how many
   did you follow the plan? Days it never came up are not failures,
   so they are excluded from the denominator. */
function planStats(id,windowDays){
  var came=0, did=0, today=isoToday();
  var span=windowDays||400;
  for(var i=0;i<span;i++){
    var d=new Date(); d.setDate(d.getDate()-i);
    var iso=isoDate(d);
    if(iso>today) continue;
    var m=markOf(iso,id);
    if(m.c){ came++; if(m.f) did++; }
  }
  return {came:came, did:did, pct: came?Math.round(did/came*100):null};
}

/* ── Home rows ─────────────────────────────────────────── */
function renderSitRows(){
  var box=document.getElementById('sit-rows'); if(!box) return;
  var plans=homePlans();
  var iso=isoToday();

  if(!plans.length){
    box.innerHTML='<div class="sp-empty">No plans yet. Add a few in <strong>Situation plans</strong> below &#8212; the first five show here.</div>';
    var sy0=document.getElementById('sit-sync'); if(sy0) sy0.textContent='';
    var cy0=document.getElementById('sit-carry'); if(cy0) cy0.textContent='';
    return;
  }

  box.innerHTML=plans.map(function(p,i){
    var m=markOf(iso,p.sheetId);
    var st=planStats(p.sheetId,14);
    var rate = st.pct===null ? '' : '<span class="sp-rate">'+st.did+'/'+st.came+' followed \u00b7 14d</span>';
    return '<div class="sp-item">'+ptTile(p.situation,p.approach)+'<div class="sp-body">'+
      '<div class="sp-when">'+escH(p.situation)+'</div>'+
      '<div class="sp-then">'+escH(p.approach)+'</div>'+
      '<div class="sp-marks">'+
        '<button class="sp-mk came'+(m.c?' on':'')+'" onclick="markPlan(\''+p.sheetId+'\',\'c\')">'+
          (m.c?'\u2713 Came up':'Came up?')+'</button>'+
        (m.c
          ? '<button class="sp-mk did'+(m.f===1?' on':'')+'" onclick="markPlan(\''+p.sheetId+'\',\'f1\')">\u2713 Followed</button>'+
            '<button class="sp-mk miss'+(m.f===0?' on':'')+'" onclick="markPlan(\''+p.sheetId+'\',\'f0\')">\u2715 Didn\'t</button>'
          : '')+
        rate+
      '</div>'+
    '</div></div>';
  }).join('');

  var marked=plans.filter(function(p){ return markOf(iso,p.sheetId).c!==undefined; }).length;
  var sy=document.getElementById('sit-sync');
  if(sy){ sy.textContent=marked?marked+' of '+plans.length+' marked':''; sy.className='focus-sync'+(marked===plans.length?' ok':''); }
  var cy=document.getElementById('sit-carry');
  if(cy) cy.textContent=plans.length+' active plan'+(plans.length!==1?'s':'');
}

/* Came up toggles; followed/didn't set the outcome */
function markPlan(id,what){
  var iso=isoToday();
  if(!sitLog[iso]) sitLog[iso]={};
  var cur=sitLog[iso][id]||{};

  if(what==='c'){
    if(cur.c){ delete sitLog[iso][id]; }      // tap again to clear
    else { sitLog[iso][id]={c:1}; }
  }else if(what==='f1'){
    sitLog[iso][id]={c:1,f:(cur.f===1?undefined:1)};
    if(sitLog[iso][id].f===undefined) sitLog[iso][id]={c:1};
  }else if(what==='f0'){
    sitLog[iso][id]={c:1,f:(cur.f===0?undefined:0)};
    if(sitLog[iso][id].f===undefined) sitLog[iso][id]={c:1};
  }
  renderSitRows(); renderPlanLibrary();
  saveSitLog();
}

var _slTimer=null;
function saveSitLog(){
  clearTimeout(_slTimer);
  _slTimer=setTimeout(async function(){
    var iso=isoToday(), now=new Date();
    var ok=await postToSheet({sheet:'SituationLog',
      date:now.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}),
      dateISO:iso, data:JSON.stringify(sitLog[iso]||{})});
    var sy=document.getElementById('sit-sync');
    if(sy&&!ok){ sy.textContent='Not saved'; sy.className='focus-sync err'; }
  },500);
}

/* ── Library ───────────────────────────────────────────── */
/* Open the library, expand it if collapsed, and scroll to it */
function openPlanLibrary(){
  if(!document.getElementById('pg-morning').classList.contains('on')) switchTab('morning');
  localStorage.setItem('sec_sitlib','1');
  applySection('sitlib');
  renderPlanLibrary();
  setTimeout(function(){
    var hd=document.getElementById('hd-sitlib');
    if(hd) hd.scrollIntoView({behavior:'smooth',block:'start'});
  },60);
}

/* Starter plans drawn from the habits already on this dashboard.
   Each long paragraph was split into its own trigger, because one
   plan per situation is what makes the outcome marks meaningful —
   a single "pause before reacting" entry cannot tell you whether
   it is calls, mail or conversations you actually struggle with. */
var STARTER_PLANS=[
  {s:"A call comes in and the name itself makes me angry", a:"Don't pick up. Let it ring, call back after 5 minutes."},
  {s:"I read a mail and feel anger rising", a:"Don't reply now. Draft it if needed, send only after 5 minutes."},
  {s:"Anger rises in the middle of a conversation", a:"Stay silent. Move away for 5 minutes before saying anything."},
  {s:"I notice I'm angry or in a bad mood", a:"Change surroundings for 5 minutes \u2014 deep breaths, a song, distance from the person."},
  {s:"Before explaining something important to someone", a:"Practise saying it out loud for 5 minutes first."},
  {s:"Someone complains to me about another person", a:"Don't react instantly. Ask whether this actually needs me to intervene."},
  {s:"I catch myself replaying something I did badly", a:"Note it once, then move on. Be as kind to myself as I would be to someone else."},
  {s:"I feel the urge to assert dominance in a discussion", a:"Stay calm. Ask whether the situation really calls for that response."},
  {s:"Someone adds me to a mail trail", a:"Decide deliberately \u2014 mine to do, delegate, or leave. Don't absorb it by default."},
  {s:"An argument turns heated", a:"Stop talking. Go quiet and alone, put attention on something else \u2014 winning isn't the point."}
];

async function importStarterPlans(){
  var existing=sitPlans.map(function(p){ return p.situation.toLowerCase().trim(); });
  var fresh=STARTER_PLANS.filter(function(p){ return existing.indexOf(p.s.toLowerCase().trim())===-1; });
  if(!fresh.length){ showToast('Those plans are already in your library.',''); return; }
  if(!confirm('Add '+fresh.length+' plan'+(fresh.length!==1?'s':'')+' from your habit list?\n\nThe first five will show on your home page; the rest stay in the library until you promote them.')) return;

  var base=activePlans().length;
  var btn=document.getElementById('spl-sync');
  if(btn){ btn.textContent='Adding\u2026'; btn.className='sync-txt syncing'; }

  var added=0;
  for(var i=0;i<fresh.length;i++){
    var id='p'+(Date.now()+i);
    var order=base+i;
    sitPlans.push({sheetId:id,situation:fresh[i].s,approach:fresh[i].a,status:'active',order:order});
    renderPlanLibrary();
    var ok=await postToSheet({sheet:'SituationPlans',sheetId:id,
      situation:fresh[i].s,approach:fresh[i].a,status:'active',order:order});
    if(ok) added++;
    if(btn) btn.textContent='Adding '+(i+1)+' of '+fresh.length+'\u2026';
  }
  renderPlanLibrary(); renderSitRows();
  if(btn){ btn.textContent=added===fresh.length?'Added '+added+' \u2713':'Added '+added+' of '+fresh.length;
           btn.className='sync-txt '+(added===fresh.length?'ok':'err'); }
  showToast(added+' plan'+(added!==1?'s':'')+' added \u2713','success');
}

function setPlanView(v){
  planView=v;
  document.getElementById('spl-tab-active').classList.toggle('on',v==='active');
  document.getElementById('spl-tab-retired').classList.toggle('on',v==='retired');
  renderPlanLibrary();
}

function renderPlanLibrary(){
  var box=document.getElementById('spl-list'); if(!box) return;
  var act=sitPlans.filter(function(p){return p.status==='active';}).length;
  var ret=sitPlans.filter(function(p){return p.status==='retired';}).length;
  var ca=document.getElementById('spl-ct-active');  if(ca) ca.textContent=act;
  var cr=document.getElementById('spl-ct-retired'); if(cr) cr.textContent=ret;

  var imp=document.getElementById('spl-import');
  if(imp) imp.style.display = sitPlans.length ? 'none' : 'block';

  var list=sitPlans.filter(function(p){ return p.status===planView; })
                   .sort(function(a,b){ return a.order-b.order; });

  if(!list.length){
    box.innerHTML='<div class="sp-empty">'+(planView==='active'
      ? 'No active plans. Add one below.'
      : 'Nothing retired. Retire a plan when it stops needing attention \u2014 its history is kept.')+'</div>';
    return;
  }

  var homeIds=homePlans().map(function(p){return p.sheetId;});
  box.innerHTML=list.map(function(p,idx){
    var s14=planStats(p.sheetId,14), sAll=planStats(p.sheetId);
    var stat = sAll.came
      ? 'Came up <b>'+sAll.came+'</b>\u00d7 \u00b7 followed <b>'+(sAll.pct)+'%</b>'+
        (s14.came?' \u00b7 last 14d <b>'+(s14.pct===null?'\u2013':s14.pct+'%')+'</b>':'')
      : 'Not yet marked on any day';
    var onHome = homeIds.indexOf(p.sheetId)>-1 ? '<span class="spl-onhome">on home</span>' : '';
    return '<div class="spl-row" data-idx="'+idx+'">'+
      (planView==='active'
        ? '<span class="spl-grip" onpointerdown="startPlanDrag(event,'+idx+')" title="Drag to reorder">\u2630</span>'
        : '<span></span>')+
      '<div class="spl-body pt-row">'+ptTile(p.situation,p.approach)+'<div class="pt-fill">'+
        '<div class="spl-when">'+escH(p.situation)+onHome+'</div>'+
        '<div class="spl-then">\u2192 '+escH(p.approach)+'</div>'+
        '<div class="spl-stat">'+stat+'</div>'+
      '</div></div>'+
      '<div class="spl-acts">'+
        '<button class="rt-mini" onclick="editSitPlan(\''+p.sheetId+'\')" title="Edit">\u270e</button>'+
        '<button class="rt-mini" onclick="togglePlanStatus(\''+p.sheetId+'\')" title="'+
          (planView==='active'?'Retire':'Reactivate')+'">'+(planView==='active'?'\u23f8':'\u21ba')+'</button>'+
        '<button class="rt-mini del" onclick="deleteSitPlan(\''+p.sheetId+'\')" title="Delete">\u00d7</button>'+
      '</div>'+
    '</div>';
  }).join('');
}

/* A trigger you cannot observe from outside rarely fires. This is a
   nudge, not a gate — vague triggers are still allowed. */
var VAGUE=['feel','feeling','am sad','am angry','get angry','upset','anxious','stressed','bored','tempted','remember','think about'];
function checkTrigger(el){
  var tip=document.getElementById('spl-tip'); if(!tip) return;
  var t=(el.value||'').toLowerCase().trim();
  var vague = t.length>3 && VAGUE.some(function(w){ return t.indexOf(w)>-1; });
  tip.className='spl-tip'+(vague?' warn':'');
  tip.innerHTML = vague
    ? '&#9888; That trigger is a <strong>feeling</strong>, which you may not notice in the moment. If you can, anchor it to something observable \u2014 a time, a place, or an action that goes with it.'
    : 'A trigger works best when you could <strong>see it from outside</strong> &#8212; a time, a place, or an action. &ldquo;When I feel rushed&rdquo; rarely fires; &ldquo;when I sit down at my desk&rdquo; does.';
}

async function addSitPlan(){
  var s=document.getElementById('spl-sit').value.trim();
  var a=document.getElementById('spl-app').value.trim();
  if(!s||!a){ showToast('Both the trigger and the response are needed.','error'); return; }
  var id='p'+Date.now();
  var order=activePlans().length;
  sitPlans.push({sheetId:id,situation:s,approach:a,status:'active',order:order});
  document.getElementById('spl-sit').value='';
  document.getElementById('spl-app').value='';
  checkTrigger({value:''});
  renderPlanLibrary(); renderSitRows();
  var sy=document.getElementById('spl-sync'); if(sy){sy.textContent='Syncing\u2026';sy.className='sync-txt syncing';}
  var ok=await postToSheet({sheet:'SituationPlans',sheetId:id,situation:s,approach:a,status:'active',order:order});
  if(sy){ sy.textContent=ok?'Saved to Sheet \u2713':'Sheet sync failed'; sy.className='sync-txt '+(ok?'ok':'err'); }
  if(activePlans().length>HOME_PLAN_SLOTS) showToast('Added \u2014 beyond the first 5, so not on home yet.','');
}

function editSitPlan(id){
  var p=planById(id); if(!p) return;
  var html='<div style="margin-bottom:10px"><label class="sfl">When this happens</label>'+
    '<textarea class="sin" id="edit-spl-sit" rows="2">'+escH(p.situation)+'</textarea></div>'+
    '<div><label class="sfl">I will do this</label>'+
    '<textarea class="sin" id="edit-spl-app" rows="2">'+escH(p.approach)+'</textarea></div>'+
    '<div style="font-size:11px;color:var(--text-3);margin-top:8px;line-height:1.6">Outcome history stays attached to this plan.</div>';
  openEditModal('Edit plan',html,{type:'sitplan',id:id});
}

async function togglePlanStatus(id){
  var p=planById(id); if(!p) return;
  var next = p.status==='active' ? 'retired' : 'active';
  if(next==='retired' && !confirm('Retire "'+p.situation+'"?\n\nIt leaves your home page but its history is kept, and you can bring it back.')) return;
  p.status=next;
  if(next==='active') p.order=activePlans().length;
  renderPlanLibrary(); renderSitRows();
  var ok=await postToSheet({sheet:'SituationPlans',action:'set_status',sheetId:id,status:next});
  showToast(ok?(next==='retired'?'Retired.':'Active again \u2713'):'Sync failed.',ok?'':'error');
}

async function deleteSitPlan(id){
  var p=planById(id); if(!p) return;
  if(!confirm('Delete "'+p.situation+'" permanently?\n\nRetiring is usually better \u2014 it keeps the history.')) return;
  sitPlans=sitPlans.filter(function(x){ return x.sheetId!==id; });
  renderPlanLibrary(); renderSitRows();
  await postToSheet({sheet:'SituationPlans',action:'delete_plan',sheetId:id});
  showToast('Deleted.','');
}

/* Drag to reorder — the first five actives are what show on home */
var _plDrag=null;
function startPlanDrag(ev,idx){
  ev.preventDefault();
  var row=ev.target.closest('.spl-row'); if(!row) return;
  _plDrag={from:idx,to:idx,moved:false};
  row.classList.add('dragging');
  try{ ev.target.setPointerCapture(ev.pointerId); }catch(e){}
  document.addEventListener('pointermove',onPlanDragMove);
  document.addEventListener('pointerup',endPlanDrag);
  document.addEventListener('pointercancel',endPlanDrag);
}
function onPlanDragMove(ev){
  if(!_plDrag) return;
  var box=document.getElementById('spl-list'); if(!box) return;
  var rows=Array.prototype.slice.call(box.querySelectorAll('.spl-row'));
  rows.forEach(function(r){ r.classList.remove('drag-over'); });
  for(var i=0;i<rows.length;i++){
    var b=rows[i].getBoundingClientRect();
    if(ev.clientY>=b.top&&ev.clientY<=b.bottom){
      _plDrag.to=i; _plDrag.moved=true;
      if(i!==_plDrag.from) rows[i].classList.add('drag-over');
      break;
    }
  }
}
function endPlanDrag(){
  document.removeEventListener('pointermove',onPlanDragMove);
  document.removeEventListener('pointerup',endPlanDrag);
  document.removeEventListener('pointercancel',endPlanDrag);
  if(!_plDrag) return;
  var d=_plDrag; _plDrag=null;
  var box=document.getElementById('spl-list');
  if(box) box.querySelectorAll('.spl-row').forEach(function(r){ r.classList.remove('dragging','drag-over'); });
  if(!d.moved||d.to===d.from){ renderPlanLibrary(); return; }
  var list=activePlans();
  var moved=list.splice(d.from,1)[0];
  list.splice(d.to,0,moved);
  list.forEach(function(p,i){ var ref=planById(p.sheetId); if(ref) ref.order=i; });
  renderPlanLibrary(); renderSitRows();
  postToSheet({sheet:'SituationPlans',action:'reorder',
    order:list.map(function(p){return p.sheetId;}).join(',')})
    .then(function(ok){ if(ok) showToast('Order updated \u2713','success'); });
}

/* ── Sheet loaders ─────────────────────────────────────── */
function replaceSitPlansFromSheet(rows){
  sitPlans=rows.map(function(r){
    return {sheetId:r.sheetId||'',situation:r.situation||'',approach:r.approach||'',
      status:r.status==='retired'?'retired':'active',
      order:(r.order===null||r.order===undefined)?9999:Number(r.order)};
  });
  renderPlanLibrary(); renderSitRows();
}

function replaceSitLogFromSheet(rows){
  sitLog={};
  rows.forEach(function(r){
    if(!r.dateISO) return;
    try{ sitLog[r.dateISO]=JSON.parse(r.data||'{}'); }catch(e){ sitLog[r.dateISO]={}; }
  });
  renderSitRows(); renderPlanLibrary();
}

function carriedRecord(iso){
  return {
    focus:      carriedValue('focus',iso).value,
    videoUrl:   carriedValue('videoUrl',iso).value,
    videoNote:  carriedValue('videoNote',iso).value,
    situations: carriedValue('situations',iso).value
  };
}

function renderDailyFocus(){
  renderSitRows();

  var vcur=carriedValue('videoUrl',isoToday());
  var ncur=carriedValue('videoNote',isoToday());
  var u=document.getElementById('vid-url'), n=document.getElementById('vid-note');
  if(u && document.activeElement!==u) u.value=vcur.value||'';
  if(n && document.activeElement!==n){ n.value=ncur.value||''; autoGrowFocus(n); }
  _dvLast=(vcur.value||'')+'\u0000'+(ncur.value||'');
  var vs=document.getElementById('vid-sync');
  if(vs){ vs.textContent=vcur.value?'Saved \u2713':''; vs.className='focus-sync'+(vcur.value?' ok':''); }
  var vc=document.getElementById('vid-carry');
  if(vc) vc.textContent=vcur.value?carryNote(vcur.since,isoToday()):'';
  renderVideoPreview(vcur.value||'');
}

/* YouTube exposes a thumbnail by video id; other hosts do not, so
   they get a plain tile plus the watch link. */
function renderVideoPreview(url){
  var box=document.getElementById('vid-preview'); if(!box) return;
  if(!/^https?:\/\//i.test(url)){ box.innerHTML=''; return; }
  var t=ytThumb(url);
  var thumb = t
    ? '<img class="vid-thumb" src="'+escH(t)+'" alt="" onerror="this.style.opacity=.3">'
    : '<div class="vid-thumb-ph">\ud83c\udfac</div>';
  box.innerHTML='<div class="vid-prev">'+thumb+
    '<div><a class="vid-watch" href="'+escH(url)+'" target="_blank" rel="noopener">Watch \u2197</a></div></div>';
}

function saveDailyVideo(){
  var u=document.getElementById('vid-url'), n=document.getElementById('vid-note');
  if(!u||!n) return;
  var key=u.value.trim()+'\u241F'+n.value.trim();
  if(key===_dvLast) return;
  _dvLast=key;
  renderVideoPreview(u.value.trim());
  if(feedReady) renderFeed();
  var s=document.getElementById('vid-sync');
  if(s){ s.textContent='Saving\u2026'; s.className='focus-sync'; }
  clearTimeout(_dvTimer);
  _dvTimer=setTimeout(async function(){
    var ok=await pushDailyFocus();
    if(s){
      s.textContent=ok?'Saved \u2713':'Not saved';
      s.className='focus-sync '+(ok?'ok':'err');
      if(!ok&&LAST_SHEET_ERROR){ s.title=LAST_SHEET_ERROR; showToast(LAST_SHEET_ERROR,'error'); }
    }
    var vc=document.getElementById('vid-carry'); if(vc) vc.textContent='';
  },500);
}

function replaceDailyFocusFromSheet(rows){
  dailyFocus={};
  rows.forEach(function(r){
    if(!r.dateISO) return;
    dailyFocus[r.dateISO]={focus:r.focus||'',videoUrl:r.videoUrl||'',videoNote:r.videoNote||'',situations:r.situations||''};
  });
  renderDailyFocus();
}

/* ═══════════════════════════════════════════════════
   CALM PLAYER — sound generated live with the Web Audio API.
   Nothing is downloaded, so it works offline and never runs out.
   Sound choice and volume are display preferences (localStorage).
═══════════════════════════════════════════════════ */
var calm={ctx:null, master:null, verb:null, sess:null, sound:'pads', vol:60, playing:false,
          timer:null, fadeT:null, timerMin:0, breathT:null, ends:0, tick:null};
try{
  var _cp=JSON.parse(localStorage.getItem('calm_prefs')||'{}');
  if(['pads','ocean','rain','hum'].indexOf(_cp.sound)>-1) calm.sound=_cp.sound;
  if(_cp.vol!=null && !isNaN(+_cp.vol)) calm.vol=Math.max(0,Math.min(100,+_cp.vol));
}catch(e){}
function calmSavePrefs(){ try{ localStorage.setItem('calm_prefs',JSON.stringify({sound:calm.sound,vol:calm.vol})); }catch(e){} }

function calmInit(){
  if(calm.ctx) return true;
  var AC=window.AudioContext||window.webkitAudioContext;
  if(!AC){ showToast('This browser can\u2019t play generated sound.','error'); return false; }
  var c=new AC();
  calm.ctx=c;
  calm.master=c.createGain(); calm.master.gain.value=0;
  var comp=c.createDynamicsCompressor(); comp.threshold.value=-18; comp.ratio.value=3;
  calm.master.connect(comp); comp.connect(c.destination);
  // Soft room reverb from a decaying-noise impulse
  var len=Math.floor(c.sampleRate*3.5), ir=c.createBuffer(2,len,c.sampleRate);
  for(var ch=0;ch<2;ch++){ var d=ir.getChannelData(ch); for(var i=0;i<len;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/len,3); }
  calm.verb=c.createConvolver(); calm.verb.buffer=ir;
  var vg=c.createGain(); vg.gain.value=0.6; calm.verb.connect(vg); vg.connect(calm.master);
  return true;
}
function calmLevel(){ var v=calm.vol/100; return v*v*0.9; }

function calmNoise(kind,seconds){
  var c=calm.ctx, n=Math.floor(c.sampleRate*seconds), buf=c.createBuffer(2,n,c.sampleRate);
  for(var ch=0;ch<2;ch++){
    var d=buf.getChannelData(ch), last=0, b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
    for(var i=0;i<n;i++){
      var w=Math.random()*2-1;
      if(kind==='brown'){ last=(last+0.02*w)/1.02; d[i]=last*3.5; }
      else{ b0=.99886*b0+w*.0555179; b1=.99332*b1+w*.0750759; b2=.969*b2+w*.153852; b3=.8665*b3+w*.3104856;
            b4=.55*b4+w*.5329522; b5=-.7616*b5-w*.016898; d[i]=(b0+b1+b2+b3+b4+b5+b6+w*.5362)*.11; b6=w*.115926; }
    }
    // short crossfade so the loop point has no click
    var xf=Math.floor(c.sampleRate*0.05);
    for(var k=0;k<xf;k++){ var a=k/xf; d[k]=d[k]*a+d[n-xf+k]*(1-a); }
  }
  return buf;
}

/* Each sound is a "session" with its own bus, nodes and timers,
   so one can fade out while the next fades in. */
function calmStartSession(kind){
  var c=calm.ctx, t=c.currentTime, bus=c.createGain(), s={bus:bus,nodes:[],timers:[]};
  bus.gain.value=0; bus.connect(calm.master);
  bus.gain.setTargetAtTime(1,t,1.2);
  function keep(n){ s.nodes.push(n); return n; }
  function lfo(freq,depth,param,base){
    if(base!=null) param.value=base;
    var o=keep(c.createOscillator()), g=c.createGain(); o.frequency.value=freq; g.gain.value=depth;
    o.connect(g); g.connect(param); o.start(); return o;
  }

  if(kind==='pads'){
    // Slow, warm chords: Cmaj7 → Am9 → Fmaj7 → G6, about 11s each
    var chords=[[130.81,164.81,196.00,246.94],[110.00,130.81,164.81,196.00,246.94],
                [87.31,110.00,130.81,164.81],[98.00,123.47,146.83,164.81]];
    var lp=c.createBiquadFilter(); lp.type='lowpass'; lp.Q.value=0.4;
    var dry=c.createGain(); dry.gain.value=0.55;
    lp.connect(dry); dry.connect(bus); lp.connect(calm.verb);
    lfo(0.05,250,lp.frequency,900);
    var idx=0, dur=11;
    var chord=function(){
      var now=c.currentTime;
      chords[idx%chords.length].forEach(function(f,vi){
        [0,1].forEach(function(k){
          var o=c.createOscillator(), g=c.createGain();
          o.type=k?'triangle':'sine'; o.frequency.value=f*(vi===0?1:2)*(k?1.004:0.998);
          g.gain.value=0;
          g.gain.setTargetAtTime(k?0.06:0.12,now,1.6);
          g.gain.setTargetAtTime(0,now+dur-1,1.8);
          o.connect(g); g.connect(lp); o.start(now); o.stop(now+dur+8);
          s.nodes.push(o);
          o.onended=function(){ var i=s.nodes.indexOf(o); if(i>-1) s.nodes.splice(i,1); try{ g.disconnect(); }catch(e){} };
        });
      });
      idx++;
    };
    chord(); s.timers.push(setInterval(chord,(dur-2)*1000));
  }
  else if(kind==='ocean'){
    var src=keep(c.createBufferSource()); src.buffer=calmNoise('brown',6); src.loop=true;
    var f=c.createBiquadFilter(); f.type='lowpass'; f.Q.value=0.3;
    var g=c.createGain();
    src.connect(f); f.connect(g); g.connect(bus); g.connect(calm.verb);
    lfo(0.085,0.38,g.gain,0.5);       // a swell about every 12 seconds
    lfo(0.085,420,f.frequency,650);   // brighter at the crest
    src.start();
  }
  else if(kind==='rain'){
    var src2=keep(c.createBufferSource()); src2.buffer=calmNoise('pink',5); src2.loop=true;
    var hp=c.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=500;
    var lp2=c.createBiquadFilter(); lp2.type='lowpass'; lp2.frequency.value=5200;
    var g2=c.createGain();
    src2.connect(hp); hp.connect(lp2); lp2.connect(g2); g2.connect(bus);
    lfo(0.13,0.1,g2.gain,0.8);
    var src3=keep(c.createBufferSource()); src3.buffer=calmNoise('brown',6); src3.loop=true;   // low, distant bed
    var g3=c.createGain(); g3.gain.value=0.35; src3.connect(g3); g3.connect(bus);
    src2.start(); src3.start();
  }
  else{ // Deep hum: 136.1 Hz ("Om") with an octave below and a soft fifth
    var lp3=c.createBiquadFilter(); lp3.type='lowpass'; lp3.frequency.value=700;
    var g4=c.createGain();
    lp3.connect(g4); g4.connect(bus); g4.connect(calm.verb);
    [[136.1,0.22,'sine'],[68.05,0.18,'sine'],[204.15,0.05,'triangle'],[136.6,0.12,'sine']].forEach(function(v){
      var o=keep(c.createOscillator()), og=c.createGain(); o.type=v[2]; o.frequency.value=v[0]; og.gain.value=v[1];
      o.connect(og); og.connect(lp3); o.start();
    });
    lfo(0.07,0.12,g4.gain,0.42);
  }
  return s;
}
function calmStopSession(s,fade){
  if(!s) return;
  var c=calm.ctx; fade=fade||1.5;
  s.timers.forEach(clearInterval);
  try{ s.bus.gain.cancelScheduledValues(c.currentTime); s.bus.gain.setTargetAtTime(0,c.currentTime,fade/4); }catch(e){}
  setTimeout(function(){
    s.nodes.slice().forEach(function(n){ try{ n.stop(); }catch(e){} try{ n.disconnect(); }catch(e){} });
    try{ s.bus.disconnect(); }catch(e){}
  },fade*1000+300);
}

async function toggleCalm(){ if(calm.playing) stopCalm(); else await playCalm(); }
async function playCalm(){
  if(!calmInit()) return;
  try{ await calm.ctx.resume(); }catch(e){}
  clearTimeout(calm.fadeT); calm.fadeT=null;
  calm.sess=calmStartSession(calm.sound);
  calm.master.gain.cancelScheduledValues(calm.ctx.currentTime);
  calm.master.gain.setTargetAtTime(calmLevel(),calm.ctx.currentTime,0.8);
  calm.playing=true;
  if(calm.timerMin) calmArmTimer();
  calmBreathStart();
  renderCalm();
}
function stopCalm(fade){
  if(!calm.playing) return;
  calm.playing=false;
  calmStopSession(calm.sess,fade||1.5); calm.sess=null;
  clearTimeout(calm.timer); clearTimeout(calm.fadeT); calm.timer=calm.fadeT=null; calm.ends=0;
  calmBreathStop();
  renderCalm();
}
function setCalmSound(k){
  if(k===calm.sound) return;
  calm.sound=k; calmSavePrefs();
  if(calm.playing){ calmStopSession(calm.sess,2.5); calm.sess=calmStartSession(k); }
  renderCalm();
}
function setCalmVolume(v){
  calm.vol=+v; calmSavePrefs();
  if(calm.ctx&&calm.playing) calm.master.gain.setTargetAtTime(calmLevel(),calm.ctx.currentTime,0.1);
}
function setCalmTimer(m){
  calm.timerMin=+m;
  clearTimeout(calm.timer); clearTimeout(calm.fadeT); calm.timer=calm.fadeT=null; calm.ends=0;
  if(calm.playing&&calm.timerMin){
    calm.master.gain.setTargetAtTime(calmLevel(),calm.ctx.currentTime,0.3);   // undo any fade already started
    calmArmTimer();
  }
  renderCalm();
}
/* Fades out gently over the last 9 seconds, then stops */
function calmArmTimer(){
  clearTimeout(calm.timer); clearTimeout(calm.fadeT);
  calm.ends=Date.now()+calm.timerMin*60000;
  calm.timer=setTimeout(function(){
    if(calm.ctx) calm.master.gain.setTargetAtTime(0,calm.ctx.currentTime,2.5);
    calm.fadeT=setTimeout(function(){
      stopCalm(0.5);
      calm.timerMin=0; var t=document.getElementById('calm-timer'); if(t) t.value='0';
      renderCalm();
    },9000);
  },Math.max(0,calm.timerMin*60000-9000));
}

/* Breathing guide: in 4 · hold 4 · out 6, the pattern from your Guide */
function calmBreathStart(){
  var box=document.getElementById('calm-breath'), orb=document.getElementById('calm-orb'), cue=document.getElementById('calm-cue');
  if(!box||!orb||!cue) return;
  calmBreathStop(); box.hidden=false;
  var steps=[['in','Breathe in',4000],['hold','Hold',4000],['out','Breathe out',6000]], i=0;
  var step=function(){
    var st=steps[i%3]; orb.className='calm-orb '+st[0]; cue.textContent=st[1]; i++;
    calm.breathT=setTimeout(step,st[2]);
  };
  // let the orb render small first so the first "in" grows
  calm.breathT=setTimeout(step,60);
}
function calmBreathStop(){
  clearTimeout(calm.breathT); calm.breathT=null;
  var box=document.getElementById('calm-breath'), orb=document.getElementById('calm-orb');
  if(orb) orb.className='calm-orb';
  if(box) box.hidden=true;
}

function renderCalm(){
  document.querySelectorAll('.calm-chip').forEach(function(b){
    var on=b.getAttribute('data-s')===calm.sound; b.classList.toggle('on',on); b.setAttribute('aria-checked',on);
  });
  var p=document.getElementById('calm-play');
  if(p){ p.innerHTML=calm.playing?'&#10074;&#10074; Pause':'&#9654; Play'; p.setAttribute('aria-pressed',calm.playing); }
  var v=document.getElementById('calm-vol'); if(v&&+v.value!==calm.vol) v.value=calm.vol;
  var st=document.getElementById('calm-state');
  clearInterval(calm.tick); calm.tick=null;
  if(!st) return;
  var paint=function(){
    if(!calm.playing){ st.textContent=''; st.className='calm-state'; return; }
    st.className='calm-state on';
    if(calm.ends){ var left=Math.max(1,Math.ceil((calm.ends-Date.now())/60000)); st.textContent='Playing \u00b7 '+left+' min left'; }
    else st.textContent='Playing';
  };
  paint(); if(calm.playing&&calm.ends) calm.tick=setInterval(paint,15000);
}

/* ═══════════════════════════════════════════════════
   MY FEED FOR TODAY

   One pick per list, fixed for the whole day and new each morning.
   Each item is scored by hash(date | list | id) and the lowest score
   wins, so adding a new entry only changes today's pick if the new
   entry happens to win — the feed doesn't reshuffle mid-day.
═══════════════════════════════════════════════════ */
var feedReady=false, feedFailed=false;

function feedHash(str){
  var h=2166136261;
  for(var i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,16777619); }
  return h>>>0;
}
function feedPick(list,key,idOf){
  if(!list||!list.length) return null;
  var day=isoToday(), best=null, bestH=Infinity;
  list.forEach(function(x,i){
    var h=feedHash(day+'|'+key+'|'+(idOf(x)||('i'+i)));
    if(h<bestH){ bestH=h; best=x; }
  });
  return best;
}
/* Every item of a list in today's order. Index 0 is exactly feedPick's
   choice, so the card opens on today's pick and › walks on from there. */
var feedPos={post:0,learn:0,kun:0,guide:0,grat:0};   // in memory only: a refresh starts over
var feedBrowsed=false;
function feedOrder(list,key,idOf){
  var day=isoToday();
  return list.map(function(x,i){ return {x:x,h:feedHash(day+'|'+key+'|'+(idOf(x)||('i'+i)))}; })
    .sort(function(a,b){ return a.h-b.h; }).map(function(o){ return o.x; });
}
function feedAt(list,key,idOf){
  if(!list||!list.length) return {item:null,i:0,n:0};
  var ord=feedOrder(list,key,idOf), n=ord.length, i=((feedPos[key]%n)+n)%n;
  return {item:ord[i],i:i,n:n,key:key};
}
var FEED_CARD_OF={post:'feed-post',learn:'feed-learning',kun:'feed-kundali',guide:'feed-guide',grat:'feed-gratitude'};
/* ‹ and › step through the list and wrap at both ends */
function feedStep(key,dir){
  if(!feedReady) return;
  feedPos[key]=(feedPos[key]||0)+dir;
  feedBrowsed=Object.keys(feedPos).some(function(k){ return feedPos[k]!==0; });
  renderFeed();
  var b=document.querySelector('#'+FEED_CARD_OF[key]+' .feed-'+(dir<0?'prev':'next')); if(b) b.focus();
}
function feedNext(key){ feedStep(key,1); }
function feedPrev(key){ feedStep(key,-1); }
/* Back to today's picks on every card */
function feedReset(){
  Object.keys(feedPos).forEach(function(k){ feedPos[k]=0; });
  feedBrowsed=false;
  renderFeed();
  var t=document.getElementById('feed-title'); if(t) t.focus();   // the reset button hides itself now
}

function feedDate(iso){
  if(!/^\d{4}-\d{2}-\d{2}/.test(iso||'')) return '';
  var d=new Date(iso.slice(0,10)+'T00:00:00');
  return d.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:d.getFullYear()!==new Date().getFullYear()?'numeric':undefined});
}
function feedCard(id,label,inner,openLabel,openJs,meta,nav){
  var el=document.getElementById(id); if(!el) return;
  var navHtml = (nav&&nav.n>1)
    ? '<span class="feed-nav">'+
      '<button type="button" class="feed-step feed-prev" onclick="feedPrev(\''+nav.key+'\')" aria-label="Previous ('+(nav.i===0?'go to the last':'item '+nav.i+' of '+nav.n)+')" title="Previous">\u2039</button>'+
      '<span class="feed-pos">'+(nav.i+1)+' / '+nav.n+'</span>'+
      '<button type="button" class="feed-step feed-next" onclick="feedNext(\''+nav.key+'\')" aria-label="Next ('+(nav.i+1===nav.n?'back to the first':'item '+(nav.i+2)+' of '+nav.n)+')" title="Next">\u203a</button></span>'
    : '';
  el.innerHTML='<div class="feed-lbl"><span>'+label+'</span>'+navHtml+'</div>'+inner+
    '<div class="feed-meta"><span>'+(meta||'')+'</span>'+
    (openJs?'<button type="button" class="feed-open" onclick="'+openJs+'">'+openLabel+' \u203a</button>':'')+'</div>';
}
function feedEmpty(id,label,msg){
  var el=document.getElementById(id); if(!el) return;
  el.innerHTML='<div class="feed-lbl"><span>'+label+'</span></div><div class="feed-empty">'+msg+'</div>';
}
/* Motivation entries are stored as "Title  Body" (two spaces) */
function feedSplitTitle(t){
  t=String(t||'').trim();
  var m=t.match(/^(.{3,90}?)\s{2,}([\s\S]+)$/);
  return m ? {h:m[1].trim(), b:m[2].trim()} : {h:'', b:t};
}

function renderFeed(){
  var L={post:'\ud83c\udfac From your saved posts', learn:'\ud83c\udf31 Small learning', kun:'\u2728 From your Kundali',
         guide:'\ud83e\udded From your Guide', grat:'\ud83d\ude4f From your Gratitude'};
  var FEED_IDS=['feed-post','feed-learning','feed-kundali','feed-guide','feed-gratitude'];
  if(!feedReady){
    // Today's picks from earlier today paint instantly; they're the same picks anyway
    try{
      var sn=JSON.parse(localStorage.getItem('snap_feed')||'null');
      if(sn&&sn.date===isoToday()&&sn.html){
        FEED_IDS.forEach(function(id){ var el=document.getElementById(id); if(el&&sn.html[id]) el.innerHTML=sn.html[id]; });
        return;
      }
    }catch(e){}
    var msg=feedFailed?'Couldn\u2019t load. Reload the page to try again.':'Loading\u2026';
    feedEmpty('feed-post',L.post,msg); feedEmpty('feed-learning',L.learn,msg);
    feedEmpty('feed-kundali',L.kun,msg); feedEmpty('feed-guide',L.guide,msg); feedEmpty('feed-gratitude',L.grat,msg);
    return;
  }

  // Video 2 — a saved post with a link, never the same as video 1
  var mine=(document.getElementById('vid-url')||{}).value||'';
  var vids=posts.filter(function(p){ return /^https?:\/\//i.test(p.url||'') && p.url.trim()!==mine.trim(); });
  var pa=feedAt(vids,'post',function(x){ return x.sheetId||x.url; }), p=pa.item;
  if(!p) feedEmpty('feed-post',L.post,'No saved posts with a link yet. Save one in Posts and it\u2019ll show up here.');
  else{
    var yt=ytThumb(p.url), img=(p.images||'').split('|')[0];
    var thumb = yt ? '<img class="vid-thumb" src="'+escH(yt)+'" alt="" onerror="this.style.opacity=.3">'
              : (/^https?:\/\//i.test(img) ? '<img class="feed-thumb-img" src="'+escH(img)+'" alt="" onerror="this.style.opacity=.3">'
              : '<div class="vid-thumb-ph">\ud83c\udfac</div>');
    feedCard('feed-post',L.post,
      '<div class="vid-prev">'+thumb+'<div style="min-width:0">'+
        '<div class="feed-h">'+escH(p.heading||'Saved post')+'</div>'+
        '<a class="vid-watch" href="'+escH(p.url)+'" target="_blank" rel="noopener">Watch \u2197</a></div></div>'+
      (p.desc?'<div class="feed-t">'+escH(p.desc)+'</div>':''),
      'All posts',"switchTab('posts')",
      p.dateISO?'Saved '+feedDate(p.dateISO):'', pa);
  }

  // Small learning
  var learns=motEntries.filter(function(m){ return String(m.text||'').trim(); });
  var ma=feedAt(learns,'learn',function(x){ return x.sheetId||x.text; }), m=ma.item;
  if(!m) feedEmpty('feed-learning',L.learn,'Nothing in Small learnings yet.');
  else{
    var st=feedSplitTitle(m.text);
    feedCard('feed-learning',L.learn,
      (st.h?'<div class="feed-h">'+escH(st.h)+'</div>':'')+'<div class="feed-t">'+escH(st.b)+'</div>'+
      (m.example?'<div class="mot-example"><span class="mot-ex-l">&#128221; From my life</span>'+escH(m.example)+'</div>':''),
      'All learnings',"switchTab('motivation')",
      [m.category?m.category.charAt(0).toUpperCase()+m.category.slice(1):'', m.pinned?'Pinned':''].filter(Boolean).join(' \u00b7 '), ma);
  }

  // Kundali
  var kuns=kunEntries.filter(function(k){ return String(k.learning||'').trim(); });
  var ka=feedAt(kuns,'kun',function(x){ return x.sheetId||x.learning; }), k=ka.item;
  if(!k) feedEmpty('feed-kundali',L.kun,'No Kundali learnings saved yet.');
  else feedCard('feed-kundali',L.kun,
      '<div class="feed-h">'+escH(k.learning)+'</div>'+(k.logic?'<div class="feed-t">'+escH(k.logic)+'</div>':''),
      'All Kundali',"switchTab('kundali')",
      k.category?k.category.charAt(0).toUpperCase()+k.category.slice(1):'', ka);

  // Guide
  var ga=feedAt(guide,'guide',function(x){ return x.sheetId; }), g=ga.item;
  if(!g) feedEmpty('feed-guide',L.guide,'Your Guide is empty.');
  else feedCard('feed-guide',L.guide,
      '<div class="feed-h">'+escH(g.situation)+'</div>'+
      '<div class="feed-do"><b>Do</b>'+escH(g.action)+'</div>',
      'Open in Guide',"switchTab('guide');showGdItem('"+escH(g.sheetId).replace(/'/g,'')+"')",
      [escH(g.category||''), escH(g.planet||'')].filter(Boolean).join(' \u00b7 '), ga);

  // Gratitude — one past day, with everything you wrote that day
  var grats=gratEntries.filter(function(e){ return e.items&&e.items.length; });
  var ea=feedAt(grats,'grat',function(x){ return x.sheetId||x.dateISO; }), e=ea.item;
  if(!e) feedEmpty('feed-gratitude',L.grat,'No gratitude entries yet.');
  else feedCard('feed-gratitude',L.grat,
      (e.dateISO?'<div class="feed-t" style="margin-bottom:3px">On '+feedDate(e.dateISO)+' you were grateful for</div>':'')+
      '<ul class="feed-list">'+e.items.map(function(t){ return '<li>'+escH(t)+'</li>'; }).join('')+'</ul>',
      'All gratitude',"switchTab('gratitude')",'', ea);

  var rb=document.getElementById('feed-reset'); if(rb) rb.hidden=!feedBrowsed;
  if(feedBrowsed) return;   // the instant-load copy is always today's original picks
  if(!(posts.length||motEntries.length||kunEntries.length||guide.length||gratEntries.length)) return;   // never save empty cards
  try{
    var html={}; FEED_IDS.forEach(function(id){ var el=document.getElementById(id); if(el) html[id]=el.innerHTML; });
    localStorage.setItem('snap_feed',JSON.stringify({date:isoToday(),html:html}));
  }catch(e){}
}

/* ═══════════════════════════════════════════════════
   FOOD HABITS — a separate list on the Routine tab. Each habit gets a
   Yes or No per day; a No can carry the reason (the food item), picked
   from that habit's own past reasons or added new.
   Follows the routine calendar's selected date, so past days can be
   filled in. Habits are archived, never deleted, so history stays.
   Sheets: FoodHabits (the list), FoodTracker (one row per habit per day).
   FoodLog (older: done IDs per day) is still read, as Yes.
═══════════════════════════════════════════════════ */
var foodHabits=[];            // [{sheetId, habit, order, addedOn, archivedOn}]
var foodMarks={};             // dateISO -> { habitId: {s:'yes'|'no', r:'reason'} }
var foodLoaded=false, foodUnsupported=false, foodFailed=false;
var foodNewReasonFor='';      // habit id whose "add a new reason" box is open
var FOOD_STARTERS=['No outside food','No fried food','No packed food','No sweet food','Eat at least 1 fruit daily'];
var _foodFb={};               // pieces collected by the fallback loader

function replaceFoodFromSheet(habits,log,track){
  foodLoaded=true; foodUnsupported=false; foodFailed=false;
  if(Array.isArray(habits)){
    foodHabits=habits.map(function(h){
      return {sheetId:h.sheetId,habit:h.habit||'',order:h.order==null?9999:Number(h.order),addedOn:h.addedOn||'',archivedOn:h.archivedOn||''};
    }).filter(function(h){ return h.sheetId; });
  }
  if(Array.isArray(log)||Array.isArray(track)){
    var m={};
    (log||[]).forEach(function(r){            // older ticks count as Yes
      if(!r.dateISO) return; m[r.dateISO]=m[r.dateISO]||{};
      (r.done||[]).forEach(function(id){ m[r.dateISO][id]={s:'yes',r:''}; });
    });
    (track||[]).forEach(function(r){          // the tracker wins over older ticks
      if(!r.dateISO||!r.habitId) return; m[r.dateISO]=m[r.dateISO]||{};
      m[r.dateISO][r.habitId]={s:r.status,r:r.reason||''};
    });
    // a mark still being saved wins over what the Sheet last had
    Object.keys(foodPending).forEach(function(k){
      var p=k.split('|'); m[p[0]]=m[p[0]]||{};
      if(foodPending[k].s) m[p[0]][p[1]]={s:foodPending[k].s,r:foodPending[k].r}; else delete m[p[0]][p[1]];
    });
    foodMarks=m;
  }
  renderFood();
}
function markFoodUnsupported(){ if(foodLoaded) return; foodUnsupported=true; renderFood(); }
function markFoodFailed(){ if(foodLoaded||foodUnsupported) return; foodFailed=true; renderFood(); }

function foodDay(){ return selDate||isoToday(); }
/* A habit applies to a day from the day it was added until the day it was archived */
function foodActiveOn(h,d){ return (!h.addedOn||h.addedOn<=d) && (!h.archivedOn||d<h.archivedOn); }
function foodListOn(d){ return foodHabits.filter(function(h){ return foodActiveOn(h,d); }); }
function foodMark(id,d){ return (foodMarks[d]||{})[id]||null; }
function foodKept(id,d){ var m=foodMark(id,d); return !!(m&&m.s==='yes'); }
function foodShift(d,n){ var x=new Date(d+'T12:00:00'); x.setDate(x.getDate()+n); return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); }

/* Days in a row marked Yes, up to the selected day. An unmarked *today*
   doesn't break the streak yet: the day isn't over. */
function foodStreak(h,d){
  var n=0, cur=d;
  if(!foodMark(h.sheetId,cur) && cur===isoToday()) cur=foodShift(cur,-1);
  while(foodActiveOn(h,cur) && foodKept(h.sheetId,cur)){ n++; cur=foodShift(cur,-1); if(n>3650) break; }
  return n;
}
/* This habit's own past reasons, most used first, then most recent */
function foodReasons(id){
  var by={};
  Object.keys(foodMarks).forEach(function(d){
    var m=foodMarks[d][id]; if(!m||m.s!=='no'||!m.r) return;
    var k=m.r.toLowerCase();
    if(!by[k]) by[k]={r:m.r,n:0,last:''};
    by[k].n++; if(d>by[k].last){ by[k].last=d; by[k].r=m.r; }
  });
  return Object.keys(by).map(function(k){ return by[k]; })
    .sort(function(a,b){ return b.n-a.n || (b.last>a.last?1:b.last<a.last?-1:0); });
}

/* Saving: one write per habit-day in flight; a newer state waits and
   replaces any older queued one, so marks can't arrive out of order. */
var foodPending={}, foodInFlight={};
async function foodSave(d,id){
  var key=d+'|'+id;
  if(foodInFlight[key]) return;
  foodInFlight[key]=true;
  var sy=document.getElementById('fd-sync');
  var h=foodHabits.find(function(x){ return x.sheetId===id; });
  while(key in foodPending){
    var st=foodPending[key]; delete foodPending[key];
    if(sy){ sy.textContent='Saving\u2026'; sy.className='sync-txt syncing'; }
    var ok=await postToSheet({sheet:'FoodTracker',dateISO:d,habitId:id,habit:h?h.habit:'',status:st.s,reason:st.r});
    if(sy){ sy.textContent=ok?'Saved to Sheet \u2713':'Couldn\u2019t save. Tap again to retry.'; sy.className='sync-txt '+(ok?'ok':'err'); }
    if(!ok && !(key in foodPending)) showToast(LAST_SHEET_ERROR||'Couldn\u2019t save your food habits.','error');
  }
  delete foodInFlight[key];
}
function foodSet(id,s,r){
  var d=foodDay();
  foodMarks[d]=foodMarks[d]||{};
  if(s) foodMarks[d][id]={s:s,r:r||''}; else delete foodMarks[d][id];
  foodPending[d+'|'+id]={s:s||'',r:r||''};
  foodSave(d,id);
}

/* Tapping the answer that's already chosen clears it */
function setFoodAnswer(id,ans){
  if(!foodLoaded||foodUnsupported) return;
  var cur=foodMark(id,foodDay());
  if(cur&&cur.s===ans){ foodSet(id,''); foodNewReasonFor=''; renderFood(); return; }
  foodSet(id,ans,ans==='no'&&cur&&cur.s==='no'?cur.r:'');
  // A first No for a habit with no past reasons goes straight to typing one
  foodNewReasonFor=(ans==='no'&&!foodReasons(id).length)?id:'';
  renderFood();
  var f=foodNewReasonFor ? document.getElementById('fd-nr-'+id) : (ans==='no' ? document.getElementById('fd-rs-'+id) : document.querySelector('.fd-y[data-id="'+id+'"]'));
  if(f) f.focus();
}
function pickFoodReason(id,val){
  if(val==='__new'){ foodNewReasonFor=id; renderFood(); var i=document.getElementById('fd-nr-'+id); if(i) i.focus(); return; }
  foodSet(id,'no',val); renderFood();
}
function saveNewFoodReason(id){
  var i=document.getElementById('fd-nr-'+id), t=(i&&i.value||'').trim();
  if(!t){ showToast('Type what you had, or pick a past reason.','error'); if(i) i.focus(); return; }
  // reuse the existing spelling if this reason was used before
  var same=foodReasons(id).find(function(x){ return x.r.toLowerCase()===t.toLowerCase(); });
  foodNewReasonFor=''; foodSet(id,'no',same?same.r:t); renderFood();
  var s=document.getElementById('fd-rs-'+id); if(s) s.focus();
}
function cancelNewFoodReason(id){
  foodNewReasonFor=''; renderFood();
  var s=document.getElementById('fd-rs-'+id); if(s) s.focus();
}

async function addFood(text){
  if(!foodLoaded||foodUnsupported) return false;
  var inp=document.getElementById('fd-new');
  var name=String(text!=null?text:(inp&&inp.value)||'').trim();
  if(!name){ showToast('Type a food habit first.','error'); return false; }
  var dup=foodHabits.some(function(h){ return !h.archivedOn && h.habit.toLowerCase()===name.toLowerCase(); });
  if(dup){ showToast('\u201c'+name+'\u201d is already on your list.','error'); return false; }
  var d=foodDay(), today=isoToday();
  var h={sheetId:'fh'+Date.now()+Math.floor(Math.random()*1000),habit:name,order:foodHabits.length,addedOn:d<today?d:today,archivedOn:''};
  foodHabits.push(h);
  if(text==null && inp) inp.value='';
  renderFood();
  var ok=await postToSheet({sheet:'FoodHabits',sheetId:h.sheetId,habit:h.habit,order:h.order,addedOn:h.addedOn});
  if(!ok){
    foodHabits=foodHabits.filter(function(x){ return x!==h; }); renderFood();
    showToast('Couldn\u2019t add \u201c'+name+'\u201d. Check your connection and try again.','error');
  }
  return ok;
}
async function addFoodStarters(){
  var have=foodHabits.filter(function(h){ return !h.archivedOn; }).map(function(h){ return h.habit.toLowerCase(); });
  var todo=FOOD_STARTERS.filter(function(s){ return have.indexOf(s.toLowerCase())===-1; });
  for(var i=0;i<todo.length;i++){ await addFood(todo[i]); }
}
async function renameFood(id){
  var h=foodHabits.find(function(x){ return x.sheetId===id; }); if(!h) return;
  var n=prompt('Rename this food habit:',h.habit);
  if(n==null) return; n=n.trim(); if(!n||n===h.habit) return;
  var old=h.habit; h.habit=n; renderFood();
  var ok=await postToSheet({sheet:'FoodHabits',action:'edit_food',sheetId:id,habit:n});
  if(!ok){ h.habit=old; renderFood(); showToast('Couldn\u2019t rename. Try again.','error'); }
}
async function archiveFood(id){
  var h=foodHabits.find(function(x){ return x.sheetId===id; }); if(!h) return;
  if(!confirm('Stop tracking \u201c'+h.habit+'\u201d from today? Its history is kept, and you can bring it back any time.')) return;
  var on=isoToday(); h.archivedOn=on; renderFood();
  var ok=await postToSheet({sheet:'FoodHabits',action:'archive_food',sheetId:id,archivedOn:on});
  if(!ok){ h.archivedOn=''; renderFood(); showToast('Couldn\u2019t stop tracking it. Try again.','error'); }
}
async function restoreFood(id){
  var h=foodHabits.find(function(x){ return x.sheetId===id; }); if(!h) return;
  var was=h.archivedOn; h.archivedOn=''; renderFood();
  var ok=await postToSheet({sheet:'FoodHabits',action:'restore_food',sheetId:id});
  if(!ok){ h.archivedOn=was; renderFood(); showToast('Couldn\u2019t bring it back. Try again.','error'); }
}

function foodRowHTML(h,d,today){
  var id=h.sheetId, m=foodMark(id,d), s=m?m.s:'', st=foodStreak(h,d), reasons=foodReasons(id), dots='';
  for(var k=6;k>=0;k--){
    var dd=foodShift(d,-k), mk=foodMark(id,dd), cls='fd-dot', what='not marked';
    if(!foodActiveOn(h,dd)){ cls+=' na'; what='not tracked yet'; }
    else if(mk&&mk.s==='yes'){ cls+=' yes'; what='Yes'; }
    else if(mk&&mk.s==='no'){ cls+=' no'; what='No'+(mk.r?' ('+mk.r+')':''); }
    else if(dd===today) cls+=' open';
    var lbl=new Date(dd+'T12:00:00').toLocaleDateString('en-IN',{weekday:'short',day:'numeric'});
    dots+='<span class="'+cls+'" title="'+escH(lbl+': '+what)+'"></span>';
  }
  var meta=[st?st+'-day streak':'No streak yet'];
  if(reasons.length) meta.push('Most often: '+escH(reasons[0].r)+(reasons[0].n>1?' ('+reasons[0].n+'\u00d7)':''));

  var why='';
  if(s==='no'){
    if(foodNewReasonFor===id){
      why='<div class="fd-why"><label class="fd-why-l" for="fd-nr-'+id+'">What did you have?</label>'+
        '<div class="fd-why-new"><input class="sin" id="fd-nr-'+id+'" type="text" placeholder="e.g. Samosa at office" '+
          'onkeydown="if(event.key===\'Enter\'){saveNewFoodReason(\''+id+'\');event.preventDefault();}else if(event.key===\'Escape\'){cancelNewFoodReason(\''+id+'\');}">'+
        '<button type="button" class="btn gold" onclick="saveNewFoodReason(\''+id+'\')">Save</button>'+
        (reasons.length?'<button type="button" class="btn" onclick="cancelNewFoodReason(\''+id+'\')">Cancel</button>':'')+
        '</div></div>';
    }else{
      var opts='<option value=""'+(m.r?'':' selected')+' disabled>Pick a reason\u2026</option>'+
        reasons.map(function(x){ return '<option value="'+escH(x.r)+'"'+(m.r&&x.r.toLowerCase()===m.r.toLowerCase()?' selected':'')+'>'+escH(x.r)+(x.n>1?' ('+x.n+'\u00d7)':'')+'</option>'; }).join('')+
        '<option value="__new">+ Add a new reason\u2026</option>';
      why='<div class="fd-why"><label class="fd-why-l" for="fd-rs-'+id+'">What did you have?</label>'+
        '<select class="fd-sel'+(m.r?'':' empty')+'" id="fd-rs-'+id+'" onchange="pickFoodReason(\''+id+'\',this.value)">'+opts+'</select></div>';
    }
  }
  return '<li class="fd-row'+(s?' '+s:'')+'">'+
    '<div class="fd-main">'+
      '<div class="fd-txt"><span class="fd-name">'+escH(h.habit)+'</span><span class="fd-meta">'+meta.join(' \u00b7 ')+'</span></div>'+
      '<span class="fd-dots" aria-label="Last 7 days">'+dots+'</span>'+
      '<div class="fd-yn" role="group" aria-label="Did you follow \u201c'+escH(h.habit)+'\u201d?">'+
        '<button type="button" class="fd-y" data-id="'+id+'" aria-pressed="'+(s==='yes')+'" onclick="setFoodAnswer(\''+id+'\',\'yes\')">Yes</button>'+
        '<button type="button" class="fd-n" data-id="'+id+'" aria-pressed="'+(s==='no')+'" onclick="setFoodAnswer(\''+id+'\',\'no\')">No</button>'+
      '</div>'+
      '<span class="fd-acts">'+
        '<button type="button" class="rt-mini" title="Rename" aria-label="Rename '+escH(h.habit)+'" onclick="renameFood(\''+id+'\')">\u270e</button>'+
        '<button type="button" class="rt-mini del" title="Stop tracking" aria-label="Stop tracking '+escH(h.habit)+'" onclick="archiveFood(\''+id+'\')">\u00d7</button>'+
      '</span>'+
    '</div>'+why+
  '</li>';
}

function renderFood(){
  var box=document.getElementById('fd-body'); if(!box) return;
  var d=foodDay(), today=isoToday();
  var dayLbl=document.getElementById('fd-day');
  if(dayLbl){
    var dt=new Date(d+'T12:00:00');
    dayLbl.textContent=(d===today?'Today, ':'')+dt.toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'});
  }
  var prog=document.getElementById('fd-prog'), badge=document.getElementById('badge-food');

  if(foodUnsupported){
    box.innerHTML='<div class="fd-note">Food habits need the updated <b>Code.gs</b>. Deploy it in Apps Script (Manage deployments \u2192 New version), then reload.</div>';
    if(prog) prog.textContent=''; if(badge) badge.textContent=''; return;
  }
  if(!foodLoaded){
    box.innerHTML='<div class="fd-note">'+(foodFailed?'Couldn\u2019t load your food habits. Reload the page to try again.':'Loading your food habits\u2026')+'</div>';
    if(prog) prog.textContent=''; return;
  }

  var list=foodListOn(d);
  var yes=list.filter(function(h){ return foodKept(h.sheetId,d); }).length;
  var no=list.filter(function(h){ var m=foodMark(h.sheetId,d); return m&&m.s==='no'; }).length;
  var open=list.length-yes-no;
  if(prog) prog.innerHTML=list.length?'<b class="y">'+yes+' Yes</b> \u00b7 <b class="n">'+no+' No</b>'+(open?' \u00b7 '+open+' to mark':''):'';
  if(badge) badge.textContent=list.length?yes+'/'+list.length:'';

  var rows;
  if(!list.length){
    rows='<div class="fd-note">'+(foodHabits.some(function(h){ return !h.archivedOn; })
      ? 'None of your food habits had started on this day.'
      : 'Track what you eat with a few simple daily rules. Mark each one Yes or No every day, and note what you had when it\u2019s a No.')+'</div>';
  }else{
    rows='<ul class="fd-list">'+list.map(function(h){ return foodRowHTML(h,d,today); }).join('')+'</ul>';
  }

  // Quick add: your starter habits that aren't on the list yet
  var have=foodHabits.filter(function(h){ return !h.archivedOn; }).map(function(h){ return h.habit.toLowerCase(); });
  var missing=FOOD_STARTERS.filter(function(s){ return have.indexOf(s.toLowerCase())===-1; });
  var quick=missing.length?'<div class="fd-quick"><span class="fd-quick-l">Quick add</span>'+
    missing.map(function(s){ return '<button type="button" class="fd-chip" onclick="addFood(\''+s.replace(/'/g,"\\'")+'\')">+ '+escH(s)+'</button>'; }).join('')+
    (missing.length>1?'<button type="button" class="fd-chip all" onclick="addFoodStarters()">Add all '+missing.length+'</button>':'')+'</div>':'';

  var archived=foodHabits.filter(function(h){ return h.archivedOn; });
  var arch=archived.length?'<details class="fd-arch"><summary>Stopped tracking ('+archived.length+')</summary>'+
    archived.map(function(h){ return '<div class="fd-arch-row"><span>'+escH(h.habit)+' <small>since '+feedDate(h.archivedOn)+'</small></span>'+
      '<button type="button" class="btn" onclick="restoreFood(\''+h.sheetId+'\')">Track again</button></div>'; }).join('')+'</details>':'';

  box.innerHTML=rows+
    '<div class="fd-add"><input class="sin" id="fd-new" type="text" placeholder="Add a food habit, e.g. No sugar in tea" '+
      'onkeydown="if(event.key===\'Enter\'){addFood();event.preventDefault();}">'+
      '<button class="btn gold" type="button" onclick="addFood()" style="white-space:nowrap">+ Add</button></div>'+
    quick+arch;
  if(typeof renderGlance==='function') renderGlance();   // keep the Morning "Food" tile in step
  renderFoodSummary();
}

/* ═══════════════════════════════════════════════════
   FOOD SUMMARY — any date range, from the food data already loaded.
   Per-habit Yes / No / not marked, what you ate when you missed,
   a day-by-day grid (ranges up to 62 days), every No by date, CSV.
   Range choice is kept in memory only.
═══════════════════════════════════════════════════ */
var fsRange={preset:'30',from:'',to:''};
var fsShowAllNos=false;

function fsEarliest(){
  var e=isoToday();
  foodHabits.forEach(function(h){ if(h.addedOn&&h.addedOn<e) e=h.addedOn; });
  Object.keys(foodMarks).forEach(function(d){ if(d<e&&Object.keys(foodMarks[d]).length) e=d; });
  return e;
}
function fsBounds(){
  var t=isoToday(), p=fsRange.preset;
  if(p==='7')   return [foodShift(t,-6),t];
  if(p==='30')  return [foodShift(t,-29),t];
  if(p==='month') return [t.slice(0,8)+'01',t];
  if(p==='lastmonth'){
    var d=new Date(t.slice(0,8)+'01T12:00:00'); d.setDate(0);
    var end=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    return [end.slice(0,8)+'01',end];
  }
  if(p==='all') return [fsEarliest(),t];
  var f=fsRange.from||foodShift(t,-29), to=fsRange.to||t;
  return f<=to?[f,to]:[to,f];
}
function setFsPreset(p){ fsRange.preset=p; fsShowAllNos=false; renderFoodSummary(); }
function setFsCustom(){
  var f=document.getElementById('fs-from'), t=document.getElementById('fs-to');
  fsRange.preset='custom'; fsRange.from=f?f.value:''; fsRange.to=t?t.value:''; fsShowAllNos=false;
  renderFoodSummary();
}
function fsDays(from,to){ var out=[], d=from, n=0; while(d<=to&&n<3700){ out.push(d); d=foodShift(d,1); n++; } return out; }
function fsFmt(d,opts){ return new Date(d+'T12:00:00').toLocaleDateString('en-IN',opts||{day:'numeric',month:'short'}); }

function fsCompute(){
  var b=fsBounds(), days=fsDays(b[0],b[1]);
  var habits=foodHabits.filter(function(h){ return days.some(function(d){ return foodActiveOn(h,d); }); });
  var per=habits.map(function(h){
    var y=0,n=0,o=0,active=0,reasons={};
    days.forEach(function(d){
      if(!foodActiveOn(h,d)) return; active++;
      var m=foodMark(h.sheetId,d);
      if(m&&m.s==='yes') y++;
      else if(m&&m.s==='no'){ n++; var k=(m.r||'').toLowerCase()||'(no reason given)'; reasons[k]=reasons[k]||{r:m.r||'(no reason given)',n:0}; reasons[k].n++; }
      else o++;
    });
    var top=Object.keys(reasons).map(function(k){ return reasons[k]; }).sort(function(a,b){ return b.n-a.n; });
    return {h:h,y:y,n:n,o:o,active:active,pct:(y+n)?Math.round(y/(y+n)*100):null,top:top};
  });
  var all={}, nos=[];
  days.forEach(function(d){
    habits.forEach(function(h){
      if(!foodActiveOn(h,d)) return;
      var m=foodMark(h.sheetId,d); if(!m||m.s!=='no') return;
      nos.push({d:d,h:h,r:m.r||''});
      if(!m.r) return;
      var k=m.r.toLowerCase(); all[k]=all[k]||{r:m.r,n:0,habits:{}}; all[k].n++; all[k].habits[h.habit]=1;
    });
  });
  var eaten=Object.keys(all).map(function(k){ return all[k]; }).sort(function(a,b){ return b.n-a.n || a.r.localeCompare(b.r); });
  var Y=per.reduce(function(s,x){ return s+x.y; },0), N=per.reduce(function(s,x){ return s+x.n; },0), O=per.reduce(function(s,x){ return s+x.o; },0);
  var fullDays=days.filter(function(d){
    var act=habits.filter(function(h){ return foodActiveOn(h,d); });
    return act.length && act.every(function(h){ return foodKept(h.sheetId,d); });
  }).length;
  return {from:b[0],to:b[1],days:days,habits:habits,per:per,eaten:eaten,nos:nos.reverse(),Y:Y,N:N,O:O,fullDays:fullDays};
}

function renderFoodSummary(){
  var box=document.getElementById('fs-body'); if(!box) return;
  if(!foodLoaded){ box.innerHTML='<div class="fd-note">'+(foodUnsupported?'Needs the updated Code.gs (see Food habits above).':'Loading\u2026')+'</div>'; return; }
  if(!foodHabits.length){ box.innerHTML='<div class="fd-note">Add food habits above, and your summary will build up here day by day.</div>'; return; }

  var c=fsCompute(), p=fsRange.preset;
  var fsb=document.getElementById('badge-foodsum');
  if(fsb){ var mk=c.Y+c.N; fsb.textContent=mk?Math.round(c.Y/mk*100)+'%':''; }
  var chips=[['7','Last 7 days'],['30','Last 30 days'],['month','This month'],['lastmonth','Last month'],['all','All time']].map(function(x){
    return '<button type="button" class="fs-chip'+(p===x[0]?' on':'')+'" aria-pressed="'+(p===x[0])+'" onclick="setFsPreset(\''+x[0]+'\')">'+x[1]+'</button>';
  }).join('');
  var head='<div class="fs-range">'+chips+
    '<span class="fs-custom'+(p==='custom'?' on':'')+'"><input type="date" id="fs-from" value="'+c.from+'" max="'+isoToday()+'" onchange="setFsCustom()" aria-label="From">'+
    '<span>to</span><input type="date" id="fs-to" value="'+c.to+'" max="'+isoToday()+'" onchange="setFsCustom()" aria-label="To"></span></div>'+
    '<div class="fs-period">'+fsFmt(c.from,{day:'numeric',month:'short',year:'numeric'})+' \u2013 '+fsFmt(c.to,{day:'numeric',month:'short',year:'numeric'})+' \u00b7 '+c.days.length+' day'+(c.days.length!==1?'s':'')+'</div>';

  if(!c.habits.length){ box.innerHTML=head+'<div class="fd-note">No food habits were being tracked in this period.</div>'; return; }

  var marked=c.Y+c.N, rate=marked?Math.round(c.Y/marked*100):null;
  var stats='<div class="fs-stats">'+
    '<div class="fs-stat"><div class="fs-n'+(rate!=null&&rate>=80?' good':'')+'">'+(rate==null?'\u2013':rate+'%')+'</div><div class="fs-l">Followed</div></div>'+
    '<div class="fs-stat"><div class="fs-n y">'+c.Y+'</div><div class="fs-l">Yes</div></div>'+
    '<div class="fs-stat"><div class="fs-n n">'+c.N+'</div><div class="fs-l">No</div></div>'+
    '<div class="fs-stat"><div class="fs-n">'+c.fullDays+'</div><div class="fs-l">Perfect days</div></div>'+
  '</div>'+(c.O?'<div class="fs-hint">'+c.O+' habit-day'+(c.O!==1?'s':'')+' not marked in this period. These aren\u2019t counted in the %.</div>':'');

  var per='<h3 class="fs-h">By habit</h3><div class="fs-habits">'+c.per.map(function(x){
    var tot=x.y+x.n+x.o||1;
    return '<div class="fs-hab">'+
      '<div class="fs-hab-top"><span class="fs-hab-name">'+escH(x.h.habit)+(x.h.archivedOn&&x.h.archivedOn<=c.to?' <small>(stopped)</small>':'')+'</span>'+
        '<span class="fs-hab-pct">'+(x.pct==null?'Not marked yet':x.pct+'% followed')+'</span></div>'+
      '<div class="fs-bar" aria-hidden="true"><span class="y" style="width:'+(x.y/tot*100)+'%"></span><span class="n" style="width:'+(x.n/tot*100)+'%"></span></div>'+
      '<div class="fs-hab-meta">'+x.y+' Yes \u00b7 '+x.n+' No'+(x.o?' \u00b7 '+x.o+' not marked':'')+
        (x.top.length?' \u00b7 Missed with: '+x.top.slice(0,3).map(function(t){ return escH(t.r)+(t.n>1?' ('+t.n+'\u00d7)':''); }).join(', '):'')+'</div>'+
    '</div>';
  }).join('')+'</div>';

  var eaten='<h3 class="fs-h">What you ate when you missed</h3>'+(c.eaten.length
    ? '<ul class="fs-eaten">'+c.eaten.map(function(e){
        var hs=Object.keys(e.habits);
        return '<li><span class="fs-e-n">'+e.n+'\u00d7</span><span class="fs-e-r">'+escH(e.r)+'</span><span class="fs-e-h">'+escH(hs.join(', '))+'</span></li>';
      }).join('')+'</ul>'
    : '<div class="fd-note">'+(c.N?'No reasons were noted for the No days.':'Nothing missed in this period.')+'</div>');

  var grid='';
  if(c.days.length<=62){
    grid='<h3 class="fs-h">Day by day</h3><div class="fs-grid-wrap"><table class="fs-grid"><thead><tr><th></th>'+
      c.days.map(function(d,i){ var dt=new Date(d+'T12:00:00'); return '<th title="'+fsFmt(d,{weekday:'short',day:'numeric',month:'short'})+'">'+(i===0||dt.getDate()===1||c.days.length<=14||dt.getDay()===1?dt.getDate():'')+'</th>'; }).join('')+
      '</tr></thead><tbody>'+c.habits.map(function(h){
        return '<tr><th scope="row">'+escH(h.habit)+'</th>'+c.days.map(function(d){
          var cls='', t=fsFmt(d,{weekday:'short',day:'numeric',month:'short'})+': ';
          if(!foodActiveOn(h,d)){ cls='na'; t+='not tracked'; }
          else{ var m=foodMark(h.sheetId,d); if(m&&m.s==='yes'){ cls='y'; t+='Yes'; } else if(m&&m.s==='no'){ cls='n'; t+='No'+(m.r?' \u2013 '+m.r:''); } else t+='not marked'; }
          return '<td class="'+cls+'" title="'+escH(t)+'"></td>';
        }).join('')+'</tr>';
      }).join('')+'</tbody></table></div>'+
      '<div class="fs-legend"><span class="y"></span>Yes <span class="n"></span>No <span></span>Not marked</div>';
  }

  var nosList='<h3 class="fs-h">Every No, by date</h3>';
  if(!c.nos.length) nosList+='<div class="fd-note">None in this period.</div>';
  else{
    var show=fsShowAllNos?c.nos:c.nos.slice(0,15), lastD='';
    nosList+='<ul class="fs-nos">'+show.map(function(x){
      var dl=x.d!==lastD?'<span class="fs-nos-d">'+fsFmt(x.d,{weekday:'short',day:'numeric',month:'short'})+'</span>':'<span class="fs-nos-d"></span>';
      lastD=x.d;
      return '<li>'+dl+'<span class="fs-nos-h">'+escH(x.h.habit)+'</span><span class="fs-nos-r">'+(x.r?escH(x.r):'<i>no reason noted</i>')+'</span></li>';
    }).join('')+'</ul>'+
    (c.nos.length>15&&!fsShowAllNos?'<button type="button" class="btn" onclick="fsShowAllNos=true;renderFoodSummary()">Show all '+c.nos.length+'</button>':'');
  }

  box.innerHTML=head+stats+per+eaten+grid+nosList+
    '<div class="fs-foot"><button type="button" class="btn" onclick="exportFoodCSV()">Export this period as CSV</button></div>';
}

function exportFoodCSV(){
  var c=fsCompute(), rows=[];
  c.days.forEach(function(d){
    c.habits.forEach(function(h){
      if(!foodActiveOn(h,d)) return;
      var m=foodMark(h.sheetId,d);
      rows.push([d,h.habit,m?(m.s==='yes'?'Yes':'No'):'Not marked',m&&m.s==='no'?m.r:'']);
    });
  });
  if(!rows.length){ showToast('Nothing to export in this period.','error'); return; }
  var csv=[['Date','Habit','Followed','Reason'].join(',')].concat(rows.map(function(r){
    return r.map(function(v){ return '"'+String(v||'').replace(/"/g,'""')+'"'; }).join(',');
  })).join('\n');
  var a=document.createElement('a');
  a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);
  a.download='food-'+c.from+'-to-'+c.to+'.csv'; a.click();
  showToast('CSV exported \u2713','success');
}

var _ciFb={};
/* ═══════════════════════════════════════════════════
   ACCESS KEY + SETTINGS
   The key lives only on this device (localStorage 'dash_key') and is
   sent with every request. Code.gs refuses requests without it once a
   DASH_KEY Script Property is set.
═══════════════════════════════════════════════════ */
var dashKeySet=null;          // from the Sheet: is a key configured there?
var lastBackup='';
var _keyPromptShown=false;
var lastLockReason='';        // 'missing' (no key reached Apps Script) | 'mismatch' | ''
function getDashKey(){ try{ return localStorage.getItem('dash_key')||''; }catch(e){ return ''; } }
function withKey(url){
  if(url.indexOf(WORKER_URL)!==0) return url;
  var k=getDashKey(); if(!k) return url;
  return url+(url.indexOf('?')>-1?'&':'?')+'key='+encodeURIComponent(k);
}
function onLocked(reason){
  if(reason) lastLockReason=reason;
  if(_keyPromptShown) return; _keyPromptShown=true;
  openSettings('locked');
}
var KEY_MSG={
  missing:'The key isn\u2019t reaching your Sheet. Your Cloudflare Worker is passing the request on without it, so Apps Script never sees the key. See \u201cFix the Worker\u201d below.',
  mismatch:'Your Sheet received this key, but it doesn\u2019t match the DASH_KEY in Apps Script. Check the spelling and capital letters (spaces and quotes don\u2019t matter).'
};
function keyMsg(text,kind){
  var m=document.getElementById('set-key-msg'); if(!m) return;
  m.textContent=text||''; m.className='set-key-msg '+(kind||'');
  var w=document.getElementById('set-worker'); if(w) w.open = lastLockReason==='missing';
}
/* Check the key with the Sheet before saving, so a wrong key can't send you round a reload loop */
async function saveDashKey(){
  var i=document.getElementById('set-key'), v=(i&&i.value||'').trim();
  if(!v){ keyMsg('Type the key first.','err'); if(i) i.focus(); return; }
  var btn=document.getElementById('set-key-save'); if(btn){ btn.disabled=true; btn.textContent='Checking\u2026'; }
  keyMsg('Checking the key with your Sheet\u2026','');
  var res=null;
  try{
    var ctrl=new AbortController(), t=setTimeout(function(){ ctrl.abort(); },20000);
    var r=await fetch(WORKER_URL+'?action=getAllDayLog&key='+encodeURIComponent(v),{signal:ctrl.signal});
    clearTimeout(t); res=JSON.parse(await r.text());
  }catch(e){ res=null; }
  if(btn){ btn.disabled=false; btn.textContent='Save'; }
  if(res&&res.status==='ok'){
    try{ localStorage.setItem('dash_key',v); }catch(e){}
    keyMsg('Key accepted \u2713 Loading your data\u2026','ok');
    setTimeout(function(){ location.reload(); },600);
    return;
  }
  if(res&&res.status==='locked'){
    lastLockReason=res.reason||'mismatch';
    keyMsg(KEY_MSG[lastLockReason]||KEY_MSG.mismatch,'err');
    if(i){ i.focus(); i.select(); }
    return;
  }
  // Couldn't reach the Sheet at all: keep the key, it's checked again on load
  try{ localStorage.setItem('dash_key',v); }catch(e){}
  keyMsg('Couldn\u2019t reach your Sheet to check the key. It\u2019s saved on this device; reload when you\u2019re back online.','err');
}
function forgetDashKey(){
  if(!confirm('Remove the key from this device? You\u2019ll need to enter it again to see your data here.')) return;
  try{ localStorage.removeItem('dash_key'); }catch(e){}
  location.reload();
}
function renderKeyWarning(){
  var el=document.getElementById('key-warn'); if(!el) return;
  var dismissed=false; try{ dismissed=sessionStorage.getItem('key_warn_off')==='1'; }catch(e){}
  el.hidden=!(dashKeySet===false && !dismissed);
}
function dismissKeyWarning(){ try{ sessionStorage.setItem('key_warn_off','1'); }catch(e){} renderKeyWarning(); }

var REM_DEFAULTS={morning:'07:30',checkin:'21:00',sleep:'22:30'};
function remTimes(){ try{ return Object.assign({},REM_DEFAULTS,JSON.parse(localStorage.getItem('rem_times')||'{}')); }catch(e){ return Object.assign({},REM_DEFAULTS); } }

function openSettings(mode){
  var locked=mode==='locked', r=remTimes();
  var keyBlock=
    '<section class="set-sec"><h3>&#128274; Access key</h3>'+
    (locked?'<p class="set-alert">Your dashboard is protected. Enter its key to see your data on this device.</p>':
      dashKeySet===true?'<p class="set-ok">Protected \u2713 Only devices with the key can read or change your data.</p>':
      dashKeySet===false?'<p class="set-alert">Not protected yet. Anyone who finds the page\u2019s address can read your data.</p>':'')+
    '<label class="sfl" for="set-key">Key on this device</label>'+
    '<div class="set-row"><input class="sin" id="set-key" type="password" autocomplete="off" value="'+escH(getDashKey())+'" placeholder="Your dashboard key" onkeydown="if(event.key===\'Enter\'){saveDashKey();}">'+
    '<button class="btn gold" type="button" id="set-key-save" onclick="saveDashKey()">Save</button>'+
    (getDashKey()?'<button class="btn" type="button" onclick="forgetDashKey()">Forget</button>':'')+'</div>'+
    '<details class="set-how"'+(dashKeySet===false?' open':'')+'><summary>How to turn protection on</summary><ol>'+
      '<li>In Apps Script, open <b>Project Settings</b> (\u2699 on the left) \u2192 <b>Script Properties</b> \u2192 <b>Add script property</b>.</li>'+
      '<li>Property: <code>DASH_KEY</code>. Value: a phrase only you know, e.g. three random words.</li>'+
      '<li>Save. No redeploy needed. Then enter the same phrase above, on each device you use.</li>'+
    '</ol></details>'+
    '<div class="set-key-msg'+(locked&&lastLockReason?' err':'')+'" id="set-key-msg" role="status">'+(locked&&getDashKey()&&KEY_MSG[lastLockReason]?KEY_MSG[lastLockReason]:'')+'</div>'+
    '<details class="set-how" id="set-worker"'+(lastLockReason==='missing'?' open':'')+'><summary>Fix the Worker (if the key isn\u2019t reaching your Sheet)</summary>'+
      '<p class="set-p">Your Worker must pass the whole address and body on to Apps Script. In Cloudflare: Workers &amp; Pages \u2192 your Worker \u2192 Edit code. Make sure the line that calls Apps Script uses the full query string, like this:</p>'+
      '<pre class="set-code">const url = new URL(request.url);\nconst target = SCRIPT_URL + url.search;   // keeps action, date AND key\nconst init = request.method === \'POST\'\n  ? { method: \'POST\', body: await request.text(),\n      headers: { \'Content-Type\': request.headers.get(\'Content-Type\') || \'application/x-www-form-urlencoded\' } }\n  : { method: \'GET\' };\nconst res = await fetch(target, { ...init, redirect: \'follow\' });</pre>'+
      '<p class="set-p">If you\u2019d rather, paste your Worker\u2019s code into the chat and I\u2019ll fix it for you.</p>'+
    '</details></section>';
  if(locked){ document.getElementById('set-body').innerHTML=keyBlock; }
  else document.getElementById('set-body').innerHTML=keyBlock+
    '<section class="set-sec"><h3>&#128276; Reminders</h3>'+
    '<p class="set-p">A web page can\u2019t remind you on its own, so this adds three daily reminders to your Google Calendar, which notifies your phone.</p>'+
    '<div class="set-rem">'+
      '<label><span>Open the dashboard</span><input type="time" id="rem-morning" value="'+r.morning+'"></label>'+
      '<label><span>Evening check-in</span><input type="time" id="rem-checkin" value="'+r.checkin+'"></label>'+
      '<label><span>Phone away, sleep by 11</span><input type="time" id="rem-sleep" value="'+r.sleep+'"></label>'+
    '</div>'+
    '<button class="btn gold" type="button" onclick="downloadReminders()">Download calendar file</button>'+
    '<details class="set-how"><summary>How to add it to Google Calendar</summary><ol>'+
      '<li>On a computer, open <b>calendar.google.com</b> \u2192 \u2699 Settings \u2192 <b>Import &amp; export</b>.</li>'+
      '<li>Choose the downloaded <code>morning-dashboard-reminders.ics</code> and click <b>Import</b>.</li>'+
      '<li>The reminders repeat daily and appear on your phone. To change a time, delete the old events and import again.</li>'+
    '</ol></details></section>'+
    '<section class="set-sec"><h3>&#128241; Install on your phone</h3>'+
    (_installEvt?'<button class="btn gold" type="button" onclick="installApp()">Install the dashboard</button>':'')+
    '<p class="set-p">Opens full-screen from your home screen like an app, and still opens if you\u2019re offline (showing your last data).</p>'+
    '<ul class="set-list"><li><b>Android (Chrome):</b> \u22ee menu \u2192 <b>Install app</b> or <b>Add to Home screen</b>.</li>'+
    '<li><b>iPhone (Safari):</b> Share \u2192 <b>Add to Home Screen</b>.</li></ul></section>'+
    '<section class="set-sec"><h3>&#128190; Backups</h3>'+
    (lastBackup?'<p class="set-ok">Last backup: '+escH(feedDate(lastBackup)||lastBackup)+'. A copy is saved on the 1st of each month (last 12 kept).</p>':
      '<p class="set-p">Not set up yet. In Apps Script, pick <code>setupMonthlyBackup</code> in the function list at the top, click <b>Run</b>, and allow access. It saves a copy of your Sheet now and on the 1st of every month into a Drive folder, keeping the last 12.</p>')+
    '</section>';
  document.getElementById('set-modal').hidden=false;
  document.body.style.overflow='hidden';
  setTimeout(function(){ var k=document.getElementById('set-key'); if(k&&(locked||!getDashKey())) k.focus(); },50);
}
function closeSettings(){ document.getElementById('set-modal').hidden=true; document.body.style.overflow=''; }

/* Reminders as a calendar file: daily repeating events with an alert at the time */
function downloadReminders(){
  var t={morning:document.getElementById('rem-morning').value||REM_DEFAULTS.morning,
         checkin:document.getElementById('rem-checkin').value||REM_DEFAULTS.checkin,
         sleep:document.getElementById('rem-sleep').value||REM_DEFAULTS.sleep};
  try{ localStorage.setItem('rem_times',JSON.stringify(t)); }catch(e){}
  var url=location.href.split('#')[0].split('?')[0];
  var start=foodShift(isoToday(),1).replace(/-/g,'');
  var now=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+/,'');
  function ev(id,time,title,desc){
    var hm=time.replace(':','')+'00';
    return ['BEGIN:VEVENT','UID:md-'+id+'@morning-dashboard','DTSTAMP:'+now,'DTSTART:'+start+'T'+hm,'DURATION:PT10M',
      'RRULE:FREQ=DAILY','SUMMARY:'+title,'DESCRIPTION:'+desc+'\\n'+url,'URL:'+url,
      'BEGIN:VALARM','ACTION:DISPLAY','TRIGGER:PT0M','DESCRIPTION:'+title,'END:VALARM','END:VEVENT'].join('\r\n');
  }
  var ics=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Morning Dashboard//EN','CALSCALE:GREGORIAN',
    ev('morning',t.morning,'\u2600\ufe0f Open your Morning Dashboard','Read your rules and today\u2019s feed.'),
    ev('checkin',t.checkin,'\ud83c\udf19 Evening check-in','Mark how your rules went today. Two minutes.'),
    ev('sleep',t.sleep,'\ud83d\udcf5 Phone away, sleep by 11','Tomorrow\u2019s 6:30 depends on tonight.'),
    'END:VCALENDAR'].join('\r\n');
  var a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([ics],{type:'text/calendar'}));
  a.download='morning-dashboard-reminders.ics'; document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },500);
  showToast('Calendar file downloaded. Import it into Google Calendar.','success');
}

/* Install as an app */
var _installEvt=null;
window.addEventListener('beforeinstallprompt',function(e){ e.preventDefault(); _installEvt=e; });
async function installApp(){
  if(!_installEvt) return;
  _installEvt.prompt();
  try{ await _installEvt.userChoice; }catch(e){}
  _installEvt=null; closeSettings();
}
if('serviceWorker' in navigator && location.protocol==='https:'){
  window.addEventListener('load',function(){ navigator.serviceWorker.register('sw.js').catch(function(e){ console.warn('[sw]',e); }); });
}

/* ═══════════════════════════════════════════════════
   SAVE QUEUE — one write per key in flight; only the newest state
   waits behind it, so changes can never reach the Sheet out of order.
═══════════════════════════════════════════════════ */
var _sqPending={}, _sqFlight={};
function queueSave(key,payload,onDone){
  _sqPending[key]={p:payload,cb:onDone};
  if(_sqFlight[key]) return;
  (async function(){
    _sqFlight[key]=true;
    while(key in _sqPending){
      var job=_sqPending[key]; delete _sqPending[key];
      var ok=await postToSheet(job.p);
      if(job.cb) job.cb(ok);
      if(!ok && !(key in _sqPending)) showToast(LAST_SHEET_ERROR||'Couldn\u2019t save. Try again.','error');
    }
    delete _sqFlight[key];
  })();
}

/* ═══════════════════════════════════════════════════
   DAY LOG (sleep, notes, weekly answers) + EVENING CHECK-IN
   Sheets: DayLog (one row per day) and RuleCheck (one row per rule per day).
   Sleep on date D = the night before D, so it lines up with that day.
═══════════════════════════════════════════════════ */
var dayLog={};               // date -> {sleptAt, wokeAt, note, weekNote}
var ruleChecks={};           // date -> {ruleId: 'followed'|'slipped'|'na'}
var ciLoaded=false, ciUnsupported=false, ciFailed=false;
var ciDate='';               // the day being checked in ('' = automatic)
var ciOpenEarly=false;

function replaceCheckinFromSheet(checks,log){
  ciLoaded=true; ciUnsupported=false; ciFailed=false;
  if(Array.isArray(checks)){
    var m={}; checks.forEach(function(c){ (m[c.dateISO]=m[c.dateISO]||{})[c.ruleId]=c.result; });
    Object.keys(_sqPending).forEach(function(k){   // unsaved marks win
      var p=_sqPending[k].p; if(p.sheet!=='RuleCheck') return;
      m[p.dateISO]=m[p.dateISO]||{}; if(p.result) m[p.dateISO][p.ruleId]=p.result; else delete m[p.dateISO][p.ruleId];
    });
    ruleChecks=m;
  }
  if(Array.isArray(log)){
    var d={}; log.forEach(function(r){ d[r.dateISO]={sleptAt:r.sleptAt||'',wokeAt:r.wokeAt||'',note:r.note||'',weekNote:r.weekNote||''}; });
    Object.keys(_sqPending).forEach(function(k){
      var p=_sqPending[k].p; if(p.sheet!=='DayLog'||p.field==='sleptAt'||p.field==='wokeAt') return;   // sleep shows its own pending state
      (d[p.dateISO]=d[p.dateISO]||{})[p.field]=p.value;
    });
    dayLog=d;
  }
  renderSleep(); renderCheckin(); renderWeekly();
}
function markCheckinUnsupported(){ if(ciLoaded) return; ciUnsupported=true; renderSleep(); renderCheckin(); renderWeekly(); }
function markCheckinFailed(){ if(ciLoaded||ciUnsupported) return; ciFailed=true; renderSleep(); renderCheckin(); renderWeekly(); }

function dlGet(d,f){ return (dayLog[d]||{})[f]||''; }
function dlSet(d,f,v){
  if(!ciLoaded||ciUnsupported) return;
  v=String(v||'').trim();
  if(dlGet(d,f)===v) return;
  (dayLog[d]=dayLog[d]||{})[f]=v;
  queueSave('dl|'+d+'|'+f,{sheet:'DayLog',dateISO:d,field:f,value:v});
}

/* Sleep and wake times: what you see is always what the Sheet holds.
   While saving, the typed time shows as pending; after the save the day is
   read back from the Sheet, and "Saved to Sheet" only appears if it's there. */
var slPending={};
function slSave(field,val){
  if(!ciLoaded||ciUnsupported) return;
  var d=isoToday(); val=String(val||'').trim();
  if(!(field in slPending) && dlGet(d,field)===val) return;
  slPending[field]=val; slSync('Saving\u2026',''); renderSleep();
  var key='dl|'+d+'|'+field;
  queueSave(key,{sheet:'DayLog',dateISO:d,field:field,value:val},async function(ok){
    if(key in _sqPending) return;            // a newer change is on its way; check that one instead
    if(!ok){ delete slPending[field]; slSync('Not saved. Check your connection and try again.','err'); renderSleep(); return; }
    var r=await sheetFetch(WORKER_URL+'?action=getAllDayLog',null,20000);
    if(key in _sqPending) return;
    delete slPending[field];
    if(r&&r.status==='ok'){
      replaceCheckinFromSheet(null,r.dayLog);
      var got=dlGet(d,field);
      slSync(got===val?'Saved to Sheet \u2713':'Not saved. Try again.',got===val?'ok':'err');
    }else{
      slSync('Saved, but couldn\u2019t re-check the Sheet.','');
    }
    renderSleep();
  });
}
var _slMsg=['',''];
function slSync(t,c){ _slMsg=[t,c]; var el=document.getElementById('sl-sync'); if(el){ el.textContent=t; el.className='sl-sync '+(c||''); } }

/* Minutes after noon-to-noon, so 00:30 counts as later than 23:30 */
function bedMins(t){
  if(!/^\d{1,2}:\d{2}$/.test(t||'')) return null;
  var p=t.split(':'), m=(+p[0])*60+(+p[1]);
  return m<12*60 ? m+24*60 : m;
}
function fmtBed(m){
  if(m==null) return '';
  m=Math.round(m)%(24*60); var h=Math.floor(m/60), mi=m%60, ap=h>=12?'PM':'AM', h12=h%12||12;
  return h12+':'+String(mi).padStart(2,'0')+' '+ap;
}
function sleepLen(slept,woke){
  var a=bedMins(slept); if(a==null||!/^\d{1,2}:\d{2}$/.test(woke||'')) return null;
  var p=woke.split(':'), b=(+p[0])*60+(+p[1])+24*60;
  var d=b-a; return d>0&&d<16*60?d:null;
}

/* ── Sleep row (Morning) ── */
function renderSleep(){
  var el=document.getElementById('sleep-row'); if(!el) return;
  if(ciUnsupported||(!ciLoaded&&ciFailed)){ el.hidden=true; return; }
  el.hidden=false;
  var d=isoToday();
  var s=('sleptAt' in slPending)?slPending.sleptAt:dlGet(d,'sleptAt');
  var w=('wokeAt' in slPending)?slPending.wokeAt:dlGet(d,'wokeAt');
  var len=sleepLen(s,w);
  var dis=ciLoaded?'':' disabled';
  el.innerHTML='<span class="sl-l">&#128564; Last night</span>'+
    '<label class="sl-f">slept at <input type="time" id="sl-slept" value="'+escH(s)+'"'+dis+' onchange="slSave(\'sleptAt\',this.value)"></label>'+
    '<label class="sl-f">woke at <input type="time" id="sl-woke" value="'+escH(w)+'"'+dis+' onchange="slSave(\'wokeAt\',this.value)"></label>'+
    (len!=null?'<span class="sl-len'+(len>=7*60?' good':'')+'">'+Math.floor(len/60)+'h '+String(len%60).padStart(2,'0')+'m</span>':'')+
    (s&&bedMins(s)<=23*60?'<span class="sl-ok">By 11 \u2713</span>':'')+
    '<span class="sl-sync '+_slMsg[1]+'" id="sl-sync" role="status">'+_slMsg[0]+'</span>';
}

/* Coming back to the tab: pick up what you saved on another device (e.g. your
   phone), and move to the new day if the date changed while it was open.
   Light requests only; nothing you're typing is overwritten. */
var _lastSync=Date.now(), _lastDay=isoToday();
document.addEventListener('visibilitychange',function(){
  if(document.visibilityState!=='visible') return;
  var dayChanged=isoToday()!==_lastDay;
  if(dayChanged){ _lastDay=isoToday(); try{ renderFeed(); renderFood(); }catch(e){} }
  if(!dayChanged && Date.now()-_lastSync<60000) return;
  _lastSync=Date.now();
  refreshDayData();
});
async function refreshDayData(){
  if(!ciLoaded||ciUnsupported) return;
  var r=await Promise.all([sheetFetch(WORKER_URL+'?action=getAllDayLog',null,20000),sheetFetch(WORKER_URL+'?action=getAllRuleChecks',null,20000)]);
  var log=r[0]&&r[0].status==='ok'?r[0].dayLog:null, chk=r[1]&&r[1].status==='ok'?r[1].ruleChecks:null;
  if(!log&&!chk) return;
  var a=document.activeElement, typing=a&&(a.id==='sl-slept'||a.id==='sl-woke'||a.id==='ci-note'||a.id==='wk-note');
  if(typing) return;                       // try again next time rather than disturb you
  replaceCheckinFromSheet(chk,log);
}

/* ── Evening check-in ── */
var CI_OPTS=[['followed','Followed'],['slipped','Slipped'],['na','Didn\u2019t come up']];
function ciDay(){
  if(ciDate) return ciDate;
  return isoToday();
}
function ciMark(d,id){ return (ruleChecks[d]||{})[id]||''; }
function setRuleCheck(id,res){
  if(!ciLoaded||ciUnsupported) return;
  var d=ciDay(), cur=ciMark(d,id), r=dailyRules.find(function(x){ return x.sheetId===id; });
  var next=cur===res?'':res;
  ruleChecks[d]=ruleChecks[d]||{};
  if(next) ruleChecks[d][id]=next; else delete ruleChecks[d][id];
  queueSave('rc|'+d+'|'+id,{sheet:'RuleCheck',dateISO:d,ruleId:id,rule:r?('When '+r.when+' \u2192 '+r.do):'',result:next});
  renderCheckin(); renderWeekly();
  var b=document.querySelector('.ci-opt[data-id="'+id+'"][data-r="'+res+'"]'); if(b) b.focus();
}
function setCiDate(d){ ciDate=d; ciOpenEarly=true; renderCheckin(); }
function openCheckinEarly(){ ciOpenEarly=true; renderCheckin(); var f=document.querySelector('#ci-body .ci-opt'); if(f) f.focus(); }

function renderCheckin(){
  var box=document.getElementById('ci-box'); if(!box) return;
  var body=document.getElementById('ci-body'), meta=document.getElementById('ci-meta');
  if(ciUnsupported){ body.innerHTML='<div class="dr-note">The evening check-in needs the updated <b>Code.gs</b>. Deploy it (Manage deployments \u2192 New version), then reload.</div>'; meta.textContent=''; return; }
  if(!ciLoaded){ body.innerHTML='<div class="dr-note">'+(ciFailed?'Couldn\u2019t load your check-in. Reload to try again.':'Loading\u2026')+'</div>'; meta.textContent=''; return; }
  var rules=dailyRules.filter(function(r){ return r.when&&r.do; });
  if(!rules.length){ body.innerHTML='<div class="dr-note">Add your rules above, and each evening you can mark how they went.</div>'; meta.textContent=''; return; }

  var today=isoToday(), y=foodShift(today,-1), d=ciDay(), hr=new Date().getHours();
  var marks=ruleChecks[d]||{}, n=rules.filter(function(r){ return marks[r.sheetId]; }).length;
  meta.textContent=(d===today?'Today':d===y?'Yesterday':feedDate(d))+' \u00b7 '+n+' of '+rules.length+' marked';

  // Before 6 PM, a quiet one-liner, unless you've already started or opened it
  var early=d===today && hr<18 && !n && !ciOpenEarly;
  var yMissed=hr<14 && d===today && rules.some(function(r){ return !ciMark(y,r.sheetId); }) && !Object.keys(ruleChecks[y]||{}).length;
  if(early){
    body.innerHTML='<div class="ci-early"><span>Tonight, take two minutes to mark how your rules went.</span>'+
      '<button type="button" class="btn" onclick="openCheckinEarly()">Open now</button>'+
      (yMissed?'<button type="button" class="btn" onclick="setCiDate(\''+y+'\')">Check in for yesterday</button>':'')+'</div>';
    box.classList.remove('active'); return;
  }
  box.classList.add('active');
  var rows=rules.map(function(r){
    var m=marks[r.sheetId]||'';
    return '<li class="ci-row'+(m?' '+m:'')+'">'+ptTile(r.when,r.do,{size:'sm'})+
      '<span class="ci-when"><b>When</b> '+escH(r.when)+'</span>'+
      '<span class="ci-opts" role="group" aria-label="How did it go?">'+CI_OPTS.map(function(o){
        return '<button type="button" class="ci-opt '+o[0]+'" data-id="'+r.sheetId+'" data-r="'+o[0]+'" aria-pressed="'+(m===o[0])+'" onclick="setRuleCheck(\''+r.sheetId+'\',\''+o[0]+'\')">'+o[1]+'</button>';
      }).join('')+'</span></li>';
  }).join('');
  var f=rules.filter(function(r){ return marks[r.sheetId]==='followed'; }).length;
  var s=rules.filter(function(r){ return marks[r.sheetId]==='slipped'; }).length;
  var done=n===rules.length?'<div class="ci-done">Done \u2713 '+f+' followed'+(s?', '+s+' slipped':'')+'. '+(s?'Tomorrow is another go.':'Good day.')+'</div>':'';
  var switcher=d===today
    ? (yMissed||Object.keys(ruleChecks[y]||{}).length<rules.length?'<button type="button" class="ci-sw" onclick="setCiDate(\''+y+'\')">Yesterday</button>':'')
    : '<button type="button" class="ci-sw" onclick="setCiDate(\''+today+'\')">Back to today</button>';
  body.innerHTML='<ul class="ci-list">'+rows+'</ul>'+done+
    '<label class="sfl" for="ci-note" style="margin-top:10px">One line about '+(d===today?'today':'that day')+' <span style="color:var(--text-3);font-weight:400">(optional)</span></label>'+
    '<textarea class="sin" id="ci-note" rows="1" placeholder="What went well, or what tripped you up?" onblur="dlSet(ciDay(),\'note\',this.value)">'+escH(dlGet(d,'note'))+'</textarea>'+
    '<div class="ci-foot">'+switcher+'</div>';
}

/* ═══════════════════════════════════════════════════
   WEEKLY REVIEW (Morning, collapsible). Week = Monday–Sunday.
═══════════════════════════════════════════════════ */
var wkOffset=0;              // 0 = this week, -1 = last week …
function weekStart(off){
  var d=new Date(isoToday()+'T12:00:00'); var dow=(d.getDay()+6)%7;   // Mon=0
  d.setDate(d.getDate()-dow+7*(off||0));
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function setWeek(dir){ wkOffset=Math.min(0,wkOffset+dir); renderWeekly(); }

function dayRoutine(d){
  try{
    var name=routineForDate(d); if(!name) return null;
    var items=itemsOn(name,d); if(!items.length) return null;
    var ids=items.map(function(i){ return i.habitId; });
    var done=doneFor(name,d).filter(function(x){ return ids.indexOf(x)>-1; }).length;
    return {done:done,total:items.length};
  }catch(e){ return null; }
}
function dayFood(d){
  var list=(typeof foodListOn==='function')?foodListOn(d):[], y=0, n=0;
  list.forEach(function(h){ var m=foodMark(h.sheetId,d); if(m&&m.s==='yes') y++; else if(m&&m.s==='no') n++; });
  return {y:y,n:n};
}
function daySlips(d){ var m=ruleChecks[d]||{}; return Object.keys(m).filter(function(k){ return m[k]==='slipped'; }).length; }
function pct(a,b){ return b?Math.round(a/b*100):null; }

function renderWeekly(){
  var box=document.getElementById('wk-body'); if(!box) return;
  var ws=weekStart(wkOffset), today=isoToday();
  var days=[]; for(var i=0;i<7;i++){ var d=foodShift(ws,i); if(d<=today) days.push(d); }
  var we=foodShift(ws,6);
  var lbl=wkOffset===0?'This week':wkOffset===-1?'Last week':'Week of '+feedDate(ws);

  // Routine
  var rD=0,rT=0; days.forEach(function(d){ var r=dayRoutine(d); if(r){ rD+=r.done; rT+=r.total; } });
  // Food
  var fY=0,fN=0; days.forEach(function(d){ var f=dayFood(d); fY+=f.y; fN+=f.n; });
  // Rules
  var per={}, rF=0, rS=0;
  dailyRules.forEach(function(r){ per[r.sheetId]={r:r,f:0,s:0,na:0}; });
  days.forEach(function(d){ var m=ruleChecks[d]||{}; Object.keys(m).forEach(function(id){
    if(!per[id]) return; if(m[id]==='followed'){ per[id].f++; rF++; } else if(m[id]==='slipped'){ per[id].s++; rS++; } else per[id].na++; }); });
  // Situations
  var sits=(typeof situations!=='undefined'?situations:[]).filter(function(s){ return s.dateISO&&s.dateISO>=ws&&s.dateISO<=we; });
  var emo={}; sits.forEach(function(s){ var e=s.emotion||'none'; emo[e]=(emo[e]||0)+1; });
  // Sleep
  var beds=days.map(function(d){ return bedMins(dlGet(d,'sleptAt')); }).filter(function(x){ return x!=null; });
  var avgBed=beds.length?beds.reduce(function(a,b){ return a+b; },0)/beds.length:null;
  var by11=beds.filter(function(m){ return m<=23*60; }).length;

  var badge=document.getElementById('badge-weekly');
  if(badge){ var rp=pct(rF,rF+rS); badge.textContent=rp==null?'':rp+'% rules'; }

  var lastNote=dlGet(weekStart(wkOffset-1),'weekNote');
  var head='<div class="wk-nav"><button type="button" class="feed-step" onclick="setWeek(-1)" aria-label="Previous week">\u2039</button>'+
    '<span class="wk-lbl"><b>'+lbl+'</b> \u00b7 '+feedDate(ws)+' \u2013 '+feedDate(we)+'</span>'+
    '<button type="button" class="feed-step" onclick="setWeek(1)" aria-label="Next week"'+(wkOffset===0?' disabled':'')+'>\u203a</button></div>'+
    (lastNote?'<div class="wk-last"><span>'+(wkOffset===0?'Last week you said':'The week before, you said')+'</span>\u201c'+escH(lastNote)+'\u201d</div>':'');

  var rp2=pct(rD,rT), fp=pct(fY,fY+fN), rlp=pct(rF,rF+rS);
  function stat(v,l,good){ return '<div class="fs-stat"><div class="fs-n'+(good?' good':'')+'">'+(v==null?'\u2013':v)+'</div><div class="fs-l">'+l+'</div></div>'; }
  var stats='<div class="fs-stats wk-stats">'+
    stat(rp2==null?null:rp2+'%','Routine',rp2>=80)+stat(fp==null?null:fp+'%','Food',fp>=80)+
    stat(rlp==null?null:rlp+'%','Rules followed',rlp>=80)+stat(sits.length,'Situations logged')+
    stat(avgBed==null?null:fmtBed(avgBed),'Avg bedtime',avgBed!=null&&avgBed<=23*60)+'</div>';

  var ruleRows=Object.keys(per).map(function(k){ return per[k]; }).filter(function(x){ return x.f||x.s||x.na; })
    .sort(function(a,b){ return b.s-a.s; });
  var rulesHtml='<h3 class="fs-h">Your rules</h3>'+(ruleRows.length?ruleRows.map(function(x,i){
    return '<div class="wk-rule'+(i===0&&x.s?' worst':'')+'">'+ptTile(x.r.when,x.r.do,{size:'sm'})+
      '<span class="wk-rule-t">When '+escH(x.r.when)+'</span>'+
      '<span class="wk-rule-n"><b class="y">'+x.f+'</b> followed \u00b7 <b class="n">'+x.s+'</b> slipped'+(x.na?' \u00b7 '+x.na+' didn\u2019t come up':'')+'</span></div>';
  }).join('')+(ruleRows[0]&&ruleRows[0].s?'<div class="fs-hint">The rule that slipped most is your focus for next week.</div>':'')
  :'<div class="fd-note">No check-ins this week yet. Use the evening check-in above.</div>');

  var sitHtml=sits.length?'<h3 class="fs-h">Situations</h3><div class="fd-note">'+sits.length+' logged: '+
    Object.keys(emo).sort(function(a,b){ return emo[b]-emo[a]; }).map(function(e){ return emo[e]+' '+escH(e); }).join(', ')+'.</div>':'';

  var sleepHtml='<h3 class="fs-h">Sleep</h3><div class="fd-note">'+(beds.length
    ? 'Bedtime logged on '+beds.length+' of '+days.length+' nights. In bed by 11 on '+by11+'.'
    : 'No bedtimes logged this week. Use \u201cLast night\u201d at the top of the page each morning.')+'</div>'+sleepImpactHTML();

  var note=dlGet(ws,'weekNote');
  var reflect='<h3 class="fs-h">What will you do differently next week?</h3>'+
    '<textarea class="sin" id="wk-note" rows="2" placeholder="One change, e.g. phone in the other room at 10:30" '+(ciLoaded?'':'disabled ')+
    'onblur="dlSet(\''+ws+'\',\'weekNote\',this.value)">'+escH(note)+'</textarea>';

  box.innerHTML=(ciUnsupported?'<div class="dr-note" style="margin-bottom:10px">Rules, sleep and notes need the updated <b>Code.gs</b>.</div>':'')+
    head+stats+rulesHtml+sitHtml+sleepHtml+reflect;
}

/* Last 30 days: what your days look like after an early night vs a late one */
function sleepImpactHTML(){
  var today=isoToday(), early=[], late=[];
  for(var i=0;i<30;i++){
    var d=foodShift(today,-i), m=bedMins(dlGet(d,'sleptAt')); if(m==null) continue;
    (m<=23*60?early:late).push(d);
  }
  if(early.length<3||late.length<3){
    return '<div class="fs-hint">After a few more logged nights (3 early, 3 late), this will compare your days after early and late nights.</div>';
  }
  function agg(list){
    var rD=0,rT=0,fY=0,fN=0,sl=0;
    list.forEach(function(d){ var r=dayRoutine(d); if(r){ rD+=r.done; rT+=r.total; } var f=dayFood(d); fY+=f.y; fN+=f.n; sl+=daySlips(d); });
    return {r:pct(rD,rT),f:pct(fY,fY+fN),s:(sl/list.length).toFixed(1)};
  }
  var a=agg(early), b=agg(late);
  function row(l,x,y,suffix){ return '<tr><th scope="row">'+l+'</th><td>'+(x==null?'\u2013':x+suffix)+'</td><td>'+(y==null?'\u2013':y+suffix)+'</td></tr>'; }
  return '<div class="wk-cmp"><div class="fs-hint" style="margin:0 0 6px">Last 30 days: the day after you slept\u2026</div>'+
    '<table><thead><tr><th></th><th>by 11 PM <small>('+early.length+' days)</small></th><th>after 11 PM <small>('+late.length+' days)</small></th></tr></thead><tbody>'+
    row('Routine done',a.r,b.r,'%')+row('Food followed',a.f,b.f,'%')+row('Rule slips per day',a.s,b.s,'')+'</tbody></table></div>';
}

/* ═══════════════════════════════════════════════════
   SITUATIONS FORM — show your matching rule and Guide advice as you type
═══════════════════════════════════════════════════ */
function renderSitMatch(){
  var el=document.getElementById('sit-match'); if(!el) return;
  var t=(document.getElementById('sit-title')||{}).value||'', g=(document.getElementById('sit-trigger')||{}).value||'';
  if((t+g).trim().length<4){ el.innerHTML=''; return; }
  var th=ptTheme(t,g); if(th===PT_DEFAULT){ el.innerHTML=''; return; }
  var rules=dailyRules.filter(function(r){ return ptTheme(r.when,r.do)===th; }).slice(0,2);
  var plans=(typeof sitPlans!=='undefined'?sitPlans:[]).filter(function(p){ return p.status!=='retired' && ptTheme(p.situation,p.approach)===th; }).slice(0,1);
  var gds=guide.filter(function(x){ return ptTheme(x.situation,x.action)===th; }).slice(0,1);
  if(!rules.length&&!plans.length&&!gds.length){ el.innerHTML=''; return; }
  el.innerHTML='<div class="sm-h">'+th[0]+' Sounds like <b>'+th[2].toLowerCase()+'</b>. What you planned for this:</div>'+
    rules.map(function(r){ return '<div class="sm-i"><span class="sm-k">Your rule</span><b>When '+escH(r.when)+'</b> \u2192 '+escH(r.do)+'</div>'; }).join('')+
    plans.map(function(p){ return '<div class="sm-i"><span class="sm-k">Your plan</span><b>'+escH(p.situation)+'</b> \u2192 '+escH(p.approach)+'</div>'; }).join('')+
    gds.map(function(x){ return '<div class="sm-i"><span class="sm-k">Guide</span><b>'+escH(x.situation)+'</b> \u2192 '+escH(x.action)+'</div>'; }).join('')+
    (rules.length?'<div class="sm-foot">Mark tonight\u2019s check-in to record whether you used it.</div>':'');
}

/* ═══════════════════════════════════════════════════
   POINT THUMBNAILS — a small emoji tile beside a point, chosen from
   its own words so it's recognisable at a glance. Emoji match the
   style of the tab bar, and never reuse a tab's own emoji.
   Checks the trigger first, then the response. Nothing is stored.
═══════════════════════════════════════════════════ */
/* Order matters: feelings first, so "angry on a call" is anger, not a call */
var PT_THEMES=[
  ['\ud83d\ude20','#E07B7B','Anger',      /\b(ang(er|ry)|irritat|rage|furious|mad\b|sharp|snap|frustrat|temper|reactive|lash)/],
  ['\ud83d\ude1f','#9AA5B8','Worry',      /\b(worr|anxi|overthink|restless|stress|tense|nervous|bad mood|low\b|sad|overwhelm|panic|upset with me|not good enough|doubt|hurt|withdraw|go silent|isolat|fear)/],
  ['\ud83d\udcac','#E0A060','Argument',   /\b(argu|debate|fight|ego|dominan|prove|last word|tit.for.tat|conversation|disagree|gossip|discussion)/],
  ['\ud83d\udee1\ufe0f','#b0a0d6','Criticism', /\b(critici|rude|insult|disrespect|blame[sd]? me|judg|taunt|mock|comment|unethical)/],
  ['\u270b','#b0a0d6','Stepping in',      /\b(complain|step in|intervene|wants me to|asks? me|asked to|request|favou?r|say no|responsib|more work|than i can handle)/],
  ['\ud83d\udd27','#C9A84C','Setback',    /\b(goes wrong|went wrong|mistake|fail|setback|blam|error|broke|messed)/],
  ['\ud83d\udccb','#7fb3d5','Preparation',/\b(meeting|interview|prepar|presentation|presenting|explain|pitch|review|call with|escalat|speak well)/],
  ['\ud83d\udd12','#4ECDC4','Plans',      /\b(plan\b|plans\b|announce|in progress|goal|project|secret|disclos|launch|start something|half.done|options|decide|decision)/],
  ['\ud83c\udf19','#8C9EFF','Sleep',      /\b(sleep|bed|night|\d{1,2}(:\d{2})?\s*pm\b|wake|tired|rest\b)/],
  ['\ud83d\udcb0','#6BBF8E','Money',      /\b(money|pay|salary|buy|spend|invest|price|cost|loan|budget|raise|bonus|offer|lifestyle|wealth|financ)/],
  ['\ud83c\udfe0','#d98cb3','Family',     /\b(family|mother|father|mom|dad|wife|husband|kids?|son|daughter|parent|home)/],
  ['\u23f3','#C9A84C','Waiting',          /\b(delay|traffic|wait|late|slow|stuck|queue|deadline|patien)/],
  ['\ud83d\udc65','#4ECDC4','People',     /\b(friend|invited|social|colleague|team|others|someone|people|relationship)/],
  ['\ud83d\udcaa','#E07B7B','Health',     /\b(health|exercise|workout|walk|gym|body|eat|food|diet|fitness|run)/],
  ['\ud83d\udcde','#7fb3d5','Calls',      /\b(call|phone|ring)/],
  ['\u2709\ufe0f','#7fb3d5','Messages',   /\b(mail|email|message|text|whatsapp|reply)/],
  ['\ud83c\udfc6','#C9A84C','Wins',       /\b(win|won|achiev|success|praise|celebrat|promot)/]
];
var PT_DEFAULT=['\ud83d\udcdd','#C9A84C','Reminder',null];
function ptTheme(trigger,response){
  var t=String(trigger||'').toLowerCase(), r=String(response||'').toLowerCase();
  for(var i=0;i<PT_THEMES.length;i++) if(PT_THEMES[i][3].test(t)) return PT_THEMES[i];
  for(var j=0;j<PT_THEMES.length;j++) if(PT_THEMES[j][3].test(r)) return PT_THEMES[j];
  return PT_DEFAULT;
}
/* opts.clearOnly: return '' when nothing matches, so unclear items get no tile.
   opts.size: 'sm' for inline lists. */
function ptTile(trigger,response,opts){
  opts=opts||{};
  var th=ptTheme(trigger,response);
  if(opts.clearOnly && th===PT_DEFAULT) return '';
  return '<span class="pt-tile'+(opts.size==='sm'?' sm':'')+'" style="--pt:'+th[1]+'" title="'+th[2]+'" aria-hidden="true">'+th[0]+'</span>';
}

/* ═══════════════════════════════════════════════════
   DAILY RULES — the standing "when → do" summary under the quote

   One list, not one per day: it carries forward unchanged until
   it's edited. Saved to the DailyRules sheet as a whole list in a
   single write (action=replace_all), so edits can't land out of order.
═══════════════════════════════════════════════════ */
var dailyRules=[];          // [{sheetId, when, do}]
var drChangedOn='';         // yyyy-mm-dd the list last changed
var drLoaded=false, drUnsupported=false, drFailed=false, drEditing=false, drSaving=false;
var drDraft=[];             // working copy while editing
var drSnapshot=false;       // showing last visit's rules while the Sheet loads (read-only)

/* Display-only copy of the last rules seen, so the top of the page paints
   instantly. Never edited from: Edit stays hidden until the Sheet answers. */
function drSaveSnap(){ try{ localStorage.setItem('snap_daily_rules',JSON.stringify({rules:dailyRules,changedOn:drChangedOn})); }catch(e){} }
function drLoadSnap(){
  if(drLoaded) return;
  try{
    var sn=JSON.parse(localStorage.getItem('snap_daily_rules')||'null');
    if(sn&&Array.isArray(sn.rules)&&sn.rules.length){ dailyRules=sn.rules; drChangedOn=sn.changedOn||''; drSnapshot=true; }
  }catch(e){}
  renderDailyRules();
}

/* Drawn from the patterns that repeat most across your Situations,
   Situation plans, Daily focus, Motivation and Kundali notes. */
var DR_SUGGESTED=[
  {when:'angry, on a call, mail or in a conversation', do:'Stay quiet. Step away for 10 minutes, then reply.'},
  {when:'an argument starts', do:'Ask: does winning this help what I want? If not, let it go.'},
  {when:'preparing for a meeting or interview', do:'Over-prepare: 10\u201320 minutes on my points and likely questions.'},
  {when:'someone complains or wants me to step in', do:'Ask: does this really need me? Not everything does.'},
  {when:'something goes wrong', do:'Own my part, not the whole. Fix it, don\u2019t blame myself.'},
  {when:'a plan is in progress', do:'Don\u2019t announce it. Stay alert until it\u2019s done.'},
  {when:'it\u2019s 10:30 PM', do:'Phone away, sleep by 11. Tomorrow\u2019s 6:30 depends on it.'}
];

function drClean(w){ return String(w||'').trim().replace(/^when\s+/i,'').trim(); }
function drFmtDate(iso){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(iso||'')) return '';
  var d=new Date(iso+'T00:00:00');
  return d.toLocaleDateString('en-IN',{day:'numeric',month:'short'})+(d.getFullYear()!==new Date().getFullYear()?' '+d.getFullYear():'');
}

function replaceDailyRulesFromSheet(rows){
  drLoaded=true; drUnsupported=false; drFailed=false;
  if(drSaving) return;                 // a save in flight wins over a stale read
  dailyRules=rows.map(function(r){ return {sheetId:r.sheetId||'', when:drClean(r.when), do:String(r['do']||'').trim()}; })
    .filter(function(r){ return r.when||r.do; });
  drChangedOn=rows.reduce(function(m,r){ return (r.changedOn||'')>m ? r.changedOn : m; },'');
  drSnapshot=false; drSaveSnap();
  if(!drEditing) renderDailyRules();
}
function markDailyRulesUnsupported(){
  if(drLoaded) return;
  drUnsupported=true; renderDailyRules();
}
function markDailyRulesFailed(){
  if(drLoaded||drUnsupported) return;
  drFailed=true; renderDailyRules();
}

function drListHTML(){
  return '<ul class="dr-list">'+dailyRules.map(function(r){
    return '<li class="dr-row">'+ptTile(r.when,r.do)+
      '<span class="dr-pair"><span class="dr-when"><b>When</b> '+escH(r.when)+'</span><span class="dr-do">'+escH(r.do)+'</span></span></li>';
  }).join('')+'</ul>';
}
function renderDailyRules(){
  var body=document.getElementById('dr-body'), btn=document.getElementById('dr-edit-btn');
  if(!body) return;
  if(drEditing){ renderDailyRulesEditor(); return; }
  if(btn) btn.style.display=(drLoaded&&dailyRules.length)?'':'none';

  if(!drLoaded && drSnapshot && dailyRules.length){
    body.innerHTML=drListHTML()+'<div class="dr-foot"><span>'+
      (drFailed||drUnsupported?'Couldn\u2019t reach the Sheet, so these are your rules from your last visit.':'Checking your Sheet for changes\u2026')+
      '</span></div>';
    return;
  }
  if(drUnsupported){
    body.innerHTML='<div class="dr-note">This section needs the updated <b>Code.gs</b>. Deploy it in Apps Script (New version), then reload.</div>';
    return;
  }
  if(!drLoaded && drFailed){ body.innerHTML='<div class="dr-note">Couldn\u2019t load your rules from the Sheet. Reload the page to try again.</div>'; return; }
  if(!drLoaded){ body.innerHTML='<div class="dr-note">Loading your rules\u2026</div>'; return; }

  if(!dailyRules.length){
    body.innerHTML='<div class="dr-note">The few rules you want in front of you every morning, like <i>When angry \u2192 stay quiet and step away</i>. They stay here every day until you change them.</div>'+
      '<div class="dr-empty-acts">'+
        '<button class="btn gold" type="button" onclick="useSuggestedRules()">Start with suggested rules</button>'+
        '<button class="btn" type="button" onclick="editDailyRules(true)">Write my own</button>'+
      '</div>';
    return;
  }
  body.innerHTML=drListHTML()+
    '<div class="dr-foot"><span>'+(drChangedOn?'Same since '+drFmtDate(drChangedOn)+'. ':'')+'Carries forward until you edit it.</span></div>';
}

/* ── Editing ── */
function editDailyRules(addBlank){
  if(drUnsupported||!drLoaded) return;
  drEditing=true;
  drDraft=dailyRules.map(function(r){ return {sheetId:r.sheetId, when:r.when, do:r.do}; });
  if(addBlank||!drDraft.length) drDraft.push({sheetId:'', when:'', do:''});
  renderDailyRulesEditor(true);
}
function useSuggestedRules(){
  if(drUnsupported||!drLoaded) return;
  drEditing=true;
  drDraft=DR_SUGGESTED.map(function(r){ return {sheetId:'', when:r.when, do:r.do}; });
  renderDailyRulesEditor();
  showToast('Suggested rules loaded. Edit anything, then save.','');
}
function drReadInputs(){
  document.querySelectorAll('#dr-body .dr-ed-row').forEach(function(row){
    var i=+row.getAttribute('data-i'); if(!drDraft[i]) return;
    drDraft[i].when=row.querySelector('.dr-in-when').value;
    drDraft[i].do=row.querySelector('.dr-in-do').value;
  });
}
function renderDailyRulesEditor(focusLast){
  var body=document.getElementById('dr-body'), btn=document.getElementById('dr-edit-btn');
  if(btn) btn.style.display='none';
  var n=drDraft.length;
  body.innerHTML=
    drDraft.map(function(r,i){
      return '<div class="dr-ed-row" data-i="'+i+'">'+
        '<div><label class="dr-ed-lbl" for="dr-w-'+i+'">When\u2026</label>'+
          '<input class="sin dr-in-when" id="dr-w-'+i+'" type="text" value="'+escH(r.when)+'" placeholder="I\u2019m angry" '+
            'onkeydown="drKey(event,'+i+',\'when\')"></div>'+
        '<div class="dr-ed-do"><label class="dr-ed-lbl" for="dr-d-'+i+'">I will\u2026</label>'+
          '<textarea class="sin dr-in-do" id="dr-d-'+i+'" rows="2" placeholder="Stay quiet and move away" '+
            'onkeydown="drKey(event,'+i+',\'do\')">'+escH(r.do)+'</textarea></div>'+
        '<div class="dr-ed-tools">'+
          '<button type="button" title="Move up" aria-label="Move rule up" onclick="drMove('+i+',-1)"'+(i===0?' disabled':'')+'>\u2191</button>'+
          '<button type="button" title="Move down" aria-label="Move rule down" onclick="drMove('+i+',1)"'+(i===n-1?' disabled':'')+'>\u2193</button>'+
          '<button type="button" class="del" title="Remove" aria-label="Remove rule" onclick="drRemove('+i+')">\u00d7</button>'+
        '</div>'+
      '</div>';
    }).join('')+
    '<div class="dr-ed-foot">'+
      '<button class="btn" type="button" onclick="drAdd()">+ Add a rule</button>'+
      '<span class="acts">'+
        '<button class="btn" type="button" onclick="cancelDailyRules()"'+(drSaving?' disabled':'')+'>Cancel</button>'+
        '<button class="btn gold" type="button" id="dr-save" onclick="saveDailyRules()"'+(drSaving?' disabled':'')+'>'+(drSaving?'Saving\u2026':'Save rules')+'</button>'+
      '</span>'+
    '</div>';
  if(focusLast){
    var last=document.getElementById('dr-w-'+(n-1));
    if(last && !last.value) last.focus();
  }
}
function drKey(e,i,field){
  if(e.key==='Escape'){ e.preventDefault(); cancelDailyRules(); return; }
  if(e.key!=='Enter') return;
  e.preventDefault();
  if(field==='when'){ var d=document.getElementById('dr-d-'+i); if(d) d.focus(); }
  else if(i===drDraft.length-1) drAdd();
  else { var w=document.getElementById('dr-w-'+(i+1)); if(w) w.focus(); }
}
function drAdd(){ drReadInputs(); drDraft.push({sheetId:'',when:'',do:''}); renderDailyRulesEditor(true); }
function drRemove(i){ drReadInputs(); drDraft.splice(i,1); renderDailyRulesEditor(); }
function drMove(i,dir){
  drReadInputs();
  var j=i+dir; if(j<0||j>=drDraft.length) return;
  var t=drDraft[i]; drDraft[i]=drDraft[j]; drDraft[j]=t;
  renderDailyRulesEditor();
  var b=document.querySelector('#dr-body .dr-ed-row[data-i="'+j+'"] .dr-ed-tools button:'+(dir<0?'first-child':'nth-child(2)'));
  if(b && !b.disabled) b.focus();
}
function cancelDailyRules(){ if(drSaving) return; drEditing=false; drDraft=[]; renderDailyRules(); }

async function saveDailyRules(){
  if(drSaving) return;
  drReadInputs();
  var half=drDraft.filter(function(r){ var w=drClean(r.when), d=String(r.do||'').trim(); return (w&&!d)||(!w&&d); });
  if(half.length){ showToast('Each rule needs both a \u201cWhen\u201d and an \u201cI will\u201d. Fill it in or remove it.','error'); return; }
  var next=drDraft.map(function(r,i){
    return {sheetId:r.sheetId||('dr'+Date.now()+'_'+i), when:drClean(r.when), do:String(r.do||'').trim()};
  }).filter(function(r){ return r.when&&r.do; });

  var sameAsBefore = next.length===dailyRules.length && next.every(function(r,i){
    return r.when===dailyRules[i].when && r.do===dailyRules[i].do;
  });
  if(sameAsBefore){ drEditing=false; renderDailyRules(); return; }

  drSaving=true; renderDailyRulesEditor();
  var today=isoToday();
  var ok=await postToSheet({sheet:'DailyRules',action:'replace_all',changedOn:today,
    rules:JSON.stringify(next.map(function(r){ return {sheetId:r.sheetId,when:r.when,'do':r.do}; }))});
  drSaving=false;
  if(!ok){
    renderDailyRulesEditor();   // keep the edits on screen so nothing is lost
    showToast('Couldn\u2019t save your rules to the Sheet. Check your connection and tap Save again.','error');
    return;
  }
  dailyRules=next; drChangedOn=today; drEditing=false; drDraft=[];
  drSaveSnap();
  renderDailyRules();
  showToast('Rules saved. They\u2019ll show here every day \u2713','success');
}

/* ═══════════════════════════════════════════════════
   SITUATION GUIDE — read from the Sheet

   Everything, stars included, lives in the Guide sheet.
   Starred is column J, written by action=star_guide.
═══════════════════════════════════════════════════ */
var guide=[];
var gdCat='All', gdPlanet='';
var gdOpen=new Set();          // ids whose details are expanded
var gdStarBusy=new Set();      // ids with a star write in flight
var gdLoaded=false;            // true once the Sheet has answered at least once
var gdDupes=[];                // [{id, keepId}] extra rows hidden from view
var gdDupeBusy=false;

/* Which emotion groups are open. A display preference, so it lives in
   localStorage like the other section states. Closed by default. */
var gdGrpOpen=new Set();
try{ var _go=localStorage.getItem('gd_groups_open'); if(_go) gdGrpOpen=new Set(JSON.parse(_go)); }catch(e){}
function saveGdGrps(){ try{ localStorage.setItem('gd_groups_open',JSON.stringify([...gdGrpOpen])); }catch(e){} }
var gdGrpShut=new Set();       // groups closed by hand while a search/filter is active
var gdFilterSig='';

var GD_PLANETS={
  Sun:['\u2609','#D9701A'], Moon:['\u263D','#5B7FA6'], Mars:['\u2642','#C8413B'],
  Mercury:['\u263F','#2F8A52'], Jupiter:['\u2643','#B8890F'], Venus:['\u2640','#C0507F'],
  Saturn:['\u2644','#34507F'], Rahu:['\u260A','#5E6670'], Ketu:['\u260B','#8A6A4F']
};
var GD_PLANET_ORDER=['Sun','Moon','Mars','Mercury','Jupiter','Venus','Saturn','Rahu','Ketu'];

function gdGlyph(p){
  var g=GD_PLANETS[p]||['\u2726','#5C5A64'];
  return '<span class="gd-glyph" style="background:'+g[1]+'" title="'+escH(p||'')+'">'+g[0]+'\uFE0E</span>';
}
function gdById(id){ return guide.find(function(x){ return x.sheetId===id; }); }
function gdStarCount(){ return guide.filter(function(g){ return g.starred; }).length; }

function gdCats(){
  var seen=[];
  guide.forEach(function(g){ if(g.category && seen.indexOf(g.category)===-1) seen.push(g.category); });
  return seen;
}

/* ── Search ──
   Every word must appear somewhere in the entry (any order, any field),
   so "boss angry" finds entries that mention both. */
function gdTerms(){
  var el=document.getElementById('gd-search');
  var q=(el&&el.value||'').toLowerCase().trim();
  return q ? q.split(/\s+/).filter(Boolean) : [];
}
function gdHay(g){
  return [g.situation,g.action,g.why,g.astro,g.category,g.planet].join(' \u0001 ').toLowerCase();
}
var gdLoose=false;   // true when no entry has every word, so any word counts
function gdMatches(g,terms){
  if(!terms.length) return true;
  var h=gdHay(g);
  var hit=function(t){ return h.indexOf(t)!==-1; };
  return gdLoose ? terms.some(hit) : terms.every(hit);
}
/* True when a term only shows up in the hidden details, so the entry
   opens itself and the reason it matched is visible. */
function gdMatchHidden(g,terms){
  if(!terms.length) return false;
  var vis=[g.situation,g.action,g.category,g.planet].join(' ').toLowerCase();
  var hid=[g.why,g.astro].join(' ').toLowerCase();
  return terms.some(function(t){ return vis.indexOf(t)===-1 && hid.indexOf(t)!==-1; });
}
function gdRx(terms){
  if(!terms.length) return null;
  var parts=terms.slice().sort(function(a,b){ return b.length-a.length; })
    .map(function(t){ return t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); });
  return new RegExp('('+parts.join('|')+')','gi');
}
/* Escape first per piece, then wrap matches — never highlight inside an entity */
function gdHL(text,rx){
  text=String(text||'');
  if(!rx) return escH(text);
  return text.split(rx).map(function(piece,i){
    return i%2 ? '<mark>'+escH(piece)+'</mark>' : escH(piece);
  }).join('');
}

function gdPassesFilters(g,terms,ignoreCat){
  if(!ignoreCat){
    if(gdCat==='Starred'){ if(!g.starred) return false; }
    else if(gdCat!=='All' && g.category!==gdCat) return false;
  }
  if(gdPlanet && g.planet!==gdPlanet) return false;
  return gdMatches(g,terms);
}

function renderGuide(){
  var listEl=document.getElementById('gd-list'); if(!listEl) return;
  var imp=document.getElementById('gd-import');
  // Only offer the import once the Sheet has actually answered — before that
  // an empty list just means "still loading", and importing would duplicate rows.
  if(imp) imp.style.display = (gdLoaded && !guide.length) ? 'block' : 'none';
  renderGdDupes();

  if(!gdLoaded && !guide.length){
    listEl.innerHTML='<div class="gd-empty">Loading your guide from the Sheet\u2026</div>';
    var c0=document.getElementById('gd-count'); if(c0) c0.textContent='';
    var e0=document.getElementById('gd-expand'); if(e0) e0.style.display='none';
    return;
  }

  var terms=gdTerms(), rx=gdRx(terms);
  var sig=terms.join(' ')+'|'+gdCat+'|'+gdPlanet;
  if(sig!==gdFilterSig){ gdFilterSig=sig; gdGrpShut.clear(); }
  var filtering = !!(terms.length || gdCat!=='All' || gdPlanet);
  gdLoose=false;
  if(terms.length>1 && !guide.some(function(g){ return gdPassesFilters(g,terms,false); })) gdLoose=true;
  var clr=document.getElementById('gd-clear'), key=document.getElementById('gd-key');
  if(clr) clr.style.display=terms.length?'':'none';
  if(key) key.style.display=terms.length?'none':'';

  // Chip counts reflect the search and planet filter, so you can see
  // which categories hold the results before clicking.
  var base=guide.filter(function(g){ return gdPassesFilters(g,terms,true); });
  var chipsEl=document.getElementById('gd-chips');
  if(chipsEl){
    var chips=[['All',base.length,'All'],['Starred',base.filter(function(g){return g.starred;}).length,'\u2605 Starred']]
      .concat(gdCats().map(function(k){
        return [k,base.filter(function(g){ return g.category===k; }).length,escH(k)];
      }));
    chipsEl.innerHTML=chips.map(function(c){
      var on=c[0]===gdCat;
      return '<button type="button" class="gd-chip'+(on?' on':'')+(c[1]||on?'':' empty')+'" aria-pressed="'+on+'" '+
        'onclick="setGdCat(\''+escH(c[0]).replace(/'/g,"\\'")+'\')">'+c[2]+' <span class="gd-chip-n">'+c[1]+'</span></button>';
    }).join('');
  }

  // Planet filter — only planets that are actually used
  var plEl=document.getElementById('gd-planets');
  if(plEl){
    var used=GD_PLANET_ORDER.filter(function(p){ return guide.some(function(g){ return g.planet===p; }); });
    plEl.style.display=used.length?'':'none';
    plEl.innerHTML='<span class="gd-planets-l">Planet</span>'+used.map(function(p){
      var on=gdPlanet===p;
      return '<button type="button" class="gd-pl'+(on?' on':'')+'" aria-pressed="'+on+'" onclick="setGdPlanet(\''+p+'\')">'+gdGlyph(p)+p+'</button>';
    }).join('');
  }

  // Categories for the add form
  var dl=document.getElementById('gd-cats');
  if(dl) dl.innerHTML=gdCats().map(function(k){ return '<option value="'+escH(k)+'">'; }).join('');

  var items=guide.filter(function(g){ return gdPassesFilters(g,terms,false); });
  var filtered = terms.length || gdCat!=='All' || gdPlanet;

  var cnt=document.getElementById('gd-count');
  if(cnt){
    cnt.innerHTML = filtered
      ? (gdLoose&&items.length?'No entry has all those words. ':'')+'Showing <b>'+items.length+'</b> of '+guide.length+(gdLoose&&items.length?' with any of them':'')+'<button type="button" class="gd-reset" onclick="resetGdFilters()">Show all</button>'
      : '<b>'+guide.length+'</b> situation'+(guide.length!==1?'s':'')+(gdStarCount()?' \u00b7 '+gdStarCount()+' starred':'');
  }

  var expBtn=document.getElementById('gd-expand');
  if(expBtn){ expBtn.textContent=gdAllOpen(items,terms,filtering)?'Collapse all':'Expand all'; expBtn.style.display=items.length?'':'none'; }

  if(!items.length){
    if(!guide.length){
      listEl.innerHTML='<div class="gd-empty">Your guide is empty. Import the starter set above, or add your first situation below.</div>';
    }else if(gdCat==='Starred' && !terms.length && !gdPlanet){
      listEl.innerHTML='<div class="gd-empty">No starred situations yet. Tap \u2606 on any entry to keep it here \u2014 starred entries also feed Today\u2019s reminder.'+
        '<br><button class="btn" type="button" onclick="resetGdFilters()">Browse all situations</button></div>';
    }else{
      listEl.innerHTML='<div class="gd-empty">Nothing matches'+(terms.length?' \u201c'+escH(terms.join(' '))+'\u201d':'')+
        (gdCat!=='All'||gdPlanet?' with these filters':'')+'. Try fewer words, or clear the filters.'+
        '<br><button class="btn" type="button" onclick="resetGdFilters()">Clear search and filters</button></div>';
    }
    renderGdToday();
    return;
  }

  // Group by category, preserving sheet order
  var groups={}, order=[];
  items.forEach(function(g){
    var k=g.category||'Other';
    if(!groups[k]){ groups[k]=[]; order.push(k); }
    groups[k].push(g);
  });

  listEl.innerHTML=order.map(function(k){
    var list=groups[k], open=gdGrpIsOpen(k,filtering);
    var stars=list.filter(function(g){ return g.starred; }).length;
    var planets=[];
    list.forEach(function(g){ if(g.planet && planets.indexOf(g.planet)===-1) planets.push(g.planet); });
    var kq=escH(k).replace(/'/g,"\\'");
    return '<section class="gd-grp'+(open?' open':'')+'">'+
      '<h3 class="gd-grp-hd"><button type="button" class="gd-grp-h" aria-expanded="'+open+'" onclick="toggleGdGrp(\''+kq+'\')">'+
        '<span class="gd-grp-name">'+escH(k)+'</span>'+
        '<span class="gd-grp-n">'+list.length+' situation'+(list.length!==1?'s':'')+'</span>'+
        (stars?'<span class="gd-grp-st">\u2605 '+stars+'</span>':'')+
        '<span class="gd-grp-pl" aria-hidden="true">'+planets.slice(0,5).map(gdGlyph).join('')+'</span>'+
        '<span class="gd-grp-chev" aria-hidden="true">\u25BE</span>'+
      '</button></h3>'+
      (open?'<div class="gd-grp-body">'+list.map(function(g){ return gdItemHTML(g,terms,rx); }).join('')+'</div>':'')+
    '</section>';
  }).join('');

  renderGdToday();
}

function gdItemHTML(g,terms,rx){
  var id=g.sheetId;
  var open=gdOpen.has(id) || gdMatchHidden(g,terms);
  var hasDetail=!!(g.why||g.astro);
  var busy=gdStarBusy.has(id);
  var detail='';
  if(hasDetail){
    detail='<div class="gd-d-grid'+(g.why&&g.astro?'':' one')+'">'+
      (g.why?'<div><div class="gd-d-l">Why it works</div><div class="gd-d-t">'+gdHL(g.why,rx)+'</div></div>':'')+
      (g.astro?'<div><div class="gd-d-l">The reading</div><div class="gd-d-astro">'+gdHL(g.astro,rx)+'</div></div>':'')+
    '</div>';
  }
  return '<article class="gd-item'+(open?' open':'')+(g.starred?' starred':'')+'" id="gd-i-'+id+'">'+
    '<div class="gd-top">'+
      '<button type="button" class="gd-row" aria-expanded="'+open+'" onclick="toggleGd(\''+id+'\')">'+
        ptTile(g.situation,g.action)+
        '<span class="gd-txt">'+
          '<span class="gd-s">'+gdHL(g.situation,rx)+'</span>'+
          '<span class="gd-do"><span class="gd-do-l">Do</span><span class="gd-a">'+gdHL(g.action,rx)+'</span></span>'+
          '<span class="gd-more">'+(open?'Hide':(hasDetail?'Why it works & the reading':'Details'))+' <span class="gd-chev">\u25BE</span></span>'+
        '</span>'+
      '</button>'+
      '<button type="button" class="gd-star'+(g.starred?' on':'')+(busy?' busy':'')+'" onclick="toggleGdStar(\''+id+'\')" '+
        'aria-pressed="'+!!g.starred+'" title="'+(g.starred?'Unstar':'Star')+'" aria-label="'+(g.starred?'Unstar':'Star')+' this situation">'+
        (g.starred?'\u2605':'\u2606')+'</button>'+
    '</div>'+
    '<div class="gd-detail">'+detail+
      '<div class="gd-foot"><span class="gd-tagline">'+escH(g.category||'Other')+(g.planet?', '+escH(g.planet):'')+'</span>'+
        '<span class="gd-acts">'+
          '<button class="rt-mini" onclick="editGuide(\''+id+'\')" title="Edit">\u270e</button>'+
          '<button class="rt-mini del" onclick="delGuide(\''+id+'\')" title="Delete">\u00d7</button>'+
        '</span></div>'+
    '</div>'+
  '</article>';
}

/* One situation surfaced each day, rotating by date so it differs
   day to day but stays the same all of today. Starred first. */
function gdTodayPick(){
  if(!guide.length) return null;
  var st=guide.filter(function(g){ return g.starred; });
  var pool=st.length?st:guide;
  return pool[Math.floor(Date.now()/864e5)%pool.length];
}
function renderGdToday(){
  var el=document.getElementById('gd-today'); if(!el) return;
  var g=gdTodayPick();
  if(!g){ el.style.display='none'; return; }
  el.style.display='block';
  el.onclick=function(){ showGdItem(g.sheetId); };
  el.innerHTML='<div class="gd-today-l">Today\u2019s reminder'+(gdStarCount()?', from your starred':'')+'</div>'+
    '<div class="gd-today-s">'+ptTile(g.situation,g.action,{size:'sm'})+'<span>'+escH(g.situation)+'</span></div>'+
    '<div class="gd-today-a">'+escH(g.action)+'</div>'+
    '<div class="gd-today-go">Open in the guide \u2193</div>';
}

/* Jump to one entry: clear anything that could hide it, open it, scroll. */
function showGdItem(id){
  var s=document.getElementById('gd-search'); if(s) s.value='';
  gdCat='All'; gdPlanet=''; gdOpen.add(id);
  var g=gdById(id); if(g){ gdGrpOpen.add(g.category||'Other'); saveGdGrps(); }
  renderGuide();
  var el=document.getElementById('gd-i-'+id);
  if(el){
    el.scrollIntoView({behavior:'smooth',block:'center'});
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  }
}

function setGdCat(k){ gdCat=k; renderGuide(); }
function setGdPlanet(p){ gdPlanet = gdPlanet===p ? '' : p; renderGuide(); }
function clearGdSearch(){ var s=document.getElementById('gd-search'); if(s){ s.value=''; s.focus(); } renderGuide(); }
function resetGdFilters(){ var s=document.getElementById('gd-search'); if(s) s.value=''; gdCat='All'; gdPlanet=''; renderGuide(); }
function toggleGd(id){ if(gdOpen.has(id)) gdOpen.delete(id); else gdOpen.add(id); renderGuide(); }
/* While searching or filtering, every group with results opens on its own
   (you can still close one by hand). Otherwise the saved choice applies. */
function gdGrpIsOpen(k,filtering){
  return filtering ? !gdGrpShut.has(k) : gdGrpOpen.has(k);
}
function gdFiltering(){ return !!(gdTerms().length || gdCat!=='All' || gdPlanet); }
function toggleGdGrp(k){
  if(gdFiltering()){ if(gdGrpShut.has(k)) gdGrpShut.delete(k); else gdGrpShut.add(k); }
  else{ if(gdGrpOpen.has(k)) gdGrpOpen.delete(k); else gdGrpOpen.add(k); saveGdGrps(); }
  renderGuide();
}
function gdAllOpen(items,terms,filtering){
  if(!items.length) return false;
  return items.every(function(g){
    return gdGrpIsOpen(g.category||'Other',filtering) && (gdOpen.has(g.sheetId)||gdMatchHidden(g,terms));
  });
}
/* Expand all: every group and every entry's details. Collapse all: the reverse. */
function toggleGdAll(){
  var terms=gdTerms(), filtering=gdFiltering();
  var items=guide.filter(function(g){ return gdPassesFilters(g,terms,false); });
  var cats=[]; items.forEach(function(g){ var k=g.category||'Other'; if(cats.indexOf(k)===-1) cats.push(k); });
  if(gdAllOpen(items,terms,filtering)){
    items.forEach(function(g){ gdOpen.delete(g.sheetId); });
    cats.forEach(function(k){ if(filtering) gdGrpShut.add(k); else gdGrpOpen.delete(k); });
  }else{
    items.forEach(function(g){ gdOpen.add(g.sheetId); });
    cats.forEach(function(k){ if(filtering) gdGrpShut.delete(k); else gdGrpOpen.add(k); });
  }
  if(!filtering) saveGdGrps();
  renderGuide();
}

/* "/" jumps to the search box while the Guide tab is showing */
document.addEventListener('keydown',function(e){
  if(e.key!=='/' || e.ctrlKey || e.metaKey || e.altKey) return;
  var pg=document.getElementById('pg-guide'); if(!pg || !pg.classList.contains('on')) return;
  var t=e.target, tag=(t&&t.tagName||'').toLowerCase();
  if(tag==='input'||tag==='textarea'||tag==='select'||(t&&t.isContentEditable)) return;
  e.preventDefault();
  var s=document.getElementById('gd-search'); if(s){ s.focus(); s.select(); }
});

/* Star / unstar — saved to the Guide sheet (column J).
   Optimistic: the star flips at once, and flips back if the write fails. */
async function toggleGdStar(id){
  var g=gdById(id); if(!g || gdStarBusy.has(id)) return;
  var next=!g.starred;
  g.starred=next; gdStarBusy.add(id); renderGuide();
  var ok=await postToSheet({sheet:'Guide',action:'star_guide',sheetId:id,starred:next?'yes':'no'});
  gdStarBusy.delete(id);
  var cur=gdById(id);
  if(!ok && cur){
    cur.starred=!next;
    showToast('Couldn\u2019t save the star to the Sheet. Check your connection and try again.','error');
  }
  renderGuide();
}

/* One-time move of stars that were saved on this device before stars
   moved to the Sheet. Runs after the first Sheet load, then deletes
   the old localStorage key so it never runs again. */
var gdLegacyMoving=false;
async function migrateLegacyGdStars(){
  if(gdLegacyMoving) return;
  var raw=null;
  try{ raw=localStorage.getItem('guide_stars'); }catch(e){ return; }
  if(!raw) return;
  var ids=[];
  try{ ids=JSON.parse(raw)||[]; }catch(e){ ids=[]; }
  var todo=ids.map(gdById).filter(function(g){ return g && !g.starred; });
  if(!todo.length){ try{ localStorage.removeItem('guide_stars'); }catch(e){} return; }
  gdLegacyMoving=true;
  var failed=0;
  for(var i=0;i<todo.length;i++){
    todo[i].starred=true;
    var ok=await postToSheet({sheet:'Guide',action:'star_guide',sheetId:todo[i].sheetId,starred:'yes'});
    if(!ok) failed++;
  }
  gdLegacyMoving=false;
  renderGuide();
  if(!failed){
    try{ localStorage.removeItem('guide_stars'); }catch(e){}
    showToast(todo.length+' starred situation'+(todo.length!==1?'s':'')+' moved to your Sheet \u2713','success');
  }else{
    showToast(failed+' star'+(failed!==1?'s':'')+' couldn\u2019t be saved to the Sheet. They\u2019ll retry next time you open the dashboard.','error');
  }
}

async function addGuide(){
  var sit=document.getElementById('gd-sit').value.trim();
  var act=document.getElementById('gd-act').value.trim();
  if(!sit||!act){ showToast('Fill in both \u201cWhen this happens\u201d and \u201cDo this\u201d.','error'); return; }
  var id='g'+Date.now();
  var rec={sheetId:id,
    category:document.getElementById('gd-cat').value.trim()||'Other',
    planet:document.getElementById('gd-planet').value.trim(),
    situation:sit, action:act,
    why:document.getElementById('gd-why').value.trim(),
    astro:document.getElementById('gd-astro').value.trim(),
    order:guide.length, starred:false};
  guide.push(rec);
  ['gd-sit','gd-act','gd-why','gd-astro'].forEach(function(x){ document.getElementById(x).value=''; });
  renderGuide();
  var sy=document.getElementById('gd-sync');
  if(sy){ sy.textContent='Saving\u2026'; sy.className='sync-txt syncing'; }
  var ok=await postToSheet({sheet:'Guide',sheetId:id,category:rec.category,planet:rec.planet,
    situation:rec.situation,action_text:rec.action,why:rec.why,astro:rec.astro,order:rec.order,starred:'no'});
  if(sy){ sy.textContent=ok?'Saved to Sheet \u2713':'Couldn\u2019t save to Sheet'; sy.className='sync-txt '+(ok?'ok':'err'); }
  if(ok) showGdItem(id);
}

function editGuide(id){
  var g=gdById(id); if(!g) return;
  var planets=['','Sun','Moon','Mars','Mercury','Jupiter','Venus','Saturn','Rahu','Ketu'];
  var html='<div style="margin-bottom:9px"><label class="sfl">Category</label>'+
      '<input class="sin" id="eg-cat" type="text" value="'+escH(g.category||'')+'"></div>'+
    '<div style="margin-bottom:9px"><label class="sfl">Planet</label><select class="sin" id="eg-planet">'+
      planets.map(function(p){ return '<option'+(p===g.planet?' selected':'')+'>'+(p||'\u2014')+'</option>'; }).join('')+'</select></div>'+
    '<div style="margin-bottom:9px"><label class="sfl">When this happens</label>'+
      '<input class="sin" id="eg-sit" type="text" value="'+escH(g.situation||'')+'"></div>'+
    '<div style="margin-bottom:9px"><label class="sfl">Do this</label>'+
      '<textarea class="sin" id="eg-act" rows="2">'+escH(g.action||'')+'</textarea></div>'+
    '<div style="margin-bottom:9px"><label class="sfl">Why it works</label>'+
      '<textarea class="sin" id="eg-why" rows="3">'+escH(g.why||'')+'</textarea></div>'+
    '<div><label class="sfl">The reading</label>'+
      '<textarea class="sin" id="eg-astro" rows="3">'+escH(g.astro||'')+'</textarea></div>';
  openEditModal('Edit situation',html,{type:'guide',id:id});
}

async function delGuide(id){
  var g=gdById(id); if(!g) return;
  if(!confirm('Delete "'+g.situation+'"?')) return;
  guide=guide.filter(function(x){ return x.sheetId!==id; });
  gdOpen.delete(id);
  renderGuide();
  await postToSheet({sheet:'Guide',action:'delete_guide',sheetId:id});
  showToast('Deleted.','');
}

function exportGuideCSV(){
  if(!guide.length){ showToast('Nothing to export.','error'); return; }
  var h=['Category','Planet','Situation','Action','Why','Reading','Starred'];
  var rows=guide.map(function(g){
    return [g.category,g.planet,g.situation,g.action,g.why,g.astro,g.starred?'yes':'no']
      .map(function(v){ return '"'+String(v||'').replace(/"/g,'""')+'"'; }).join(',');
  });
  var a=document.createElement('a');
  a.href='data:text/csv;charset=utf-8,'+encodeURIComponent([h.join(',')].concat(rows).join('\n'));
  a.download='guide-'+isoToday()+'.csv'; a.click();
  showToast('CSV exported \u2713','success');
}

function gdKey(sit,act){
  var n=function(x){ return String(x||'').toLowerCase().replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/\s+/g,' ').trim(); };
  var a=n(sit), b=n(act);
  return (a||b) ? a+'\u0001'+b : '';
}

/* Banner offering to delete the hidden duplicate rows from the Sheet */
function renderGdDupes(){
  var el=document.getElementById('gd-dupes'); if(!el) return;
  if(!gdDupes.length){ el.style.display='none'; return; }
  el.style.display='flex';
  el.innerHTML='<span>Your Sheet has <b>'+gdDupes.length+'</b> duplicate row'+(gdDupes.length!==1?'s':'')+
    '. '+(gdDupes.length!==1?'They\u2019re':'It\u2019s')+' hidden here, but still in the Sheet.</span>'+
    '<button class="btn gold" type="button" id="gd-dupes-btn" onclick="removeGdDupes()"'+(gdDupeBusy?' disabled':'')+'>'+
      (gdDupeBusy?'Removing\u2026':'Remove duplicates from Sheet')+'</button>';
}

async function removeGdDupes(){
  if(gdDupeBusy || !gdDupes.length) return;
  if(!confirm('Delete '+gdDupes.length+' duplicate row'+(gdDupes.length!==1?'s':'')+' from the Guide sheet? One copy of each situation is kept.')) return;
  gdDupeBusy=true; renderGdDupes();
  var todo=gdDupes.slice(), failed=[];
  for(var i=0;i<todo.length;i++){
    var b=document.getElementById('gd-dupes-btn');
    if(b) b.textContent='Removing '+(i+1)+' of '+todo.length+'\u2026';
    var ok=await postToSheet({sheet:'Guide',action:'delete_guide',sheetId:todo[i].id});
    if(!ok) failed.push(todo[i]);
  }
  // A star that only lived on a deleted copy is written onto the kept row
  var restar=guide.filter(function(g){ return g._starFromDupe; });
  for(var j=0;j<restar.length;j++){
    var ok2=await postToSheet({sheet:'Guide',action:'star_guide',sheetId:restar[j].sheetId,starred:'yes'});
    if(ok2) delete restar[j]._starFromDupe;
  }
  // Rows sharing one Sheet ID: deleting by ID removes either copy, so re-assert the star
  var kept=guide.filter(function(g){ return g.starred && todo.some(function(d){ return d.id===g.sheetId; }); });
  for(var k=0;k<kept.length;k++){
    await postToSheet({sheet:'Guide',action:'star_guide',sheetId:kept[k].sheetId,starred:'yes'});
  }
  gdDupes=failed; gdDupeBusy=false;
  renderGuide();
  if(failed.length) showToast(failed.length+' row'+(failed.length!==1?'s':'')+' couldn\u2019t be deleted. Tap the button again to retry.','error');
  else showToast((todo.length)+' duplicate'+(todo.length!==1?'s':'')+' removed from the Sheet \u2713','success');
}

async function fetchAllGuide(){
  var d=await sheetFetch(WORKER_URL+'?action=getAllGuide');
  if(d&&d.status==='ok'&&Array.isArray(d.guide)) replaceGuideFromSheet(d.guide);
}

function replaceGuideFromSheet(rows){
  gdLoaded=true;
  var all=rows.map(function(r){
    var sid=r.sheetId||'';
    var st=(r.starred===true||String(r.starred).toLowerCase()==='yes');
    // A star write still in flight wins over a stale read
    var prev=gdStarBusy.has(sid)?gdById(sid):null;
    return {sheetId:sid,category:r.category||'Other',planet:r.planet||'',
      situation:r.situation||'',action:r.action||'',why:r.why||'',astro:r.astro||'',
      order:(r.order===null||r.order===undefined)?9999:Number(r.order),
      starred: prev ? prev.starred : st};
  });
  // Same situation + same action = the same entry. Show it once; keep the
  // earliest row, and keep the star if any copy was starred.
  var seen={}; gdDupes=[]; guide=[];
  all.forEach(function(g){
    var k=gdKey(g.situation,g.action);
    if(!k){ guide.push(g); return; }
    var keep=seen[k];
    if(!keep){ seen[k]=g; guide.push(g); return; }
    if(g.starred && !keep.starred){ keep.starred=true; keep._starFromDupe=true; }
    gdDupes.push({id:g.sheetId, keepId:keep.sheetId});
  });
  renderGuide();
  if(guide.length) migrateLegacyGdStars();
}

/* The full guide, written to the Sheet once. After the import this
   array is never read again — the Sheet is the source of truth. */
var GUIDE_SEED=[
["Anger","Mars","A call comes in and the name itself makes me angry","Don't pick up. Call back after 5 minutes.","The first surge of anger peaks and fades within minutes. Calling back lets you choose your tone instead of reacting.","Mars sits in your 2nd house of speech, so words are where anger escapes first. A short gap turns Mars's heat into composure."],
["Anger","Mars","I read a mail and feel anger rising","Don't reply now. Draft it if you need to, and send only after 5 minutes, or the next morning if it's serious.","Written words are permanent and get forwarded. A cooled reply is shorter, clearer and gets better results.","Mars in the 2nd house plus a weak Mercury (written communication) make heated emails your biggest risk."],
["Anger","Mars","Anger rises mid-conversation","Stay silent. Excuse yourself and step away for 5 minutes.","Silence can't be quoted back. Physically moving away resets your nervous system faster than trying to calm down in place.","Mars in its own sign reacts fast and strong. Space is the simplest way to cool it."],
["Anger","Moon","I notice I'm angry or in a bad mood","Change your surroundings, breathe in 4, hold 4, out 6, and create some distance.","Mood follows body state. A change of place and slower breathing break the loop.","Your Scorpio Moon is debilitated, so moods swing intensely. Movement and breath steady the Moon."],
["Anger","Mars","I want to say something sharp to family","Say it tomorrow, about the situation, not the person.","A night's sleep softens the wording, and criticizing the situation keeps the relationship safe.","Mars in your 2nd house governs both speech and family, so sharp words hurt the people closest to you most."],
["Anger","Moon","Someone criticises me","Say \u201cLet me think about it,\u201d and respond the next day.","A delay lets you separate useful feedback from the hurt, and you come across as composed.","Your report notes you take what others say to heart. That's your Scorpio Moon, and it needs a night to settle."],
["Anger","Sun","Someone is rude to me in public","Stay calm and polite. Deal with it privately later, or not at all.","Whoever stays calm keeps the respect of everyone watching.","The Sun, your strongest planet, rules reputation. Protecting your standing matters more than winning the moment."],
["Anger","Saturn","I'm stuck in traffic or delays and feel irritated","Use the time: an audio, a call to a parent, or slow breathing.","You can't change the delay, only how you spend it.","Saturn transiting your ascendant makes delays this period's lesson. Resisting them makes them heavier."],
["Anger","Mars","An argument keeps escalating","Pause it: \u201cLet's continue this in an hour.\u201d","Arguments escalate when both people are flooded with emotion. A pause lets reason come back.","Mars gives you a strong fighting instinct. Choosing when to fight is how you master it."],
["Overthinking","Saturn","Something goes wrong and I start blaming myself","Ask three questions: what part was mine, what wasn't, what's next.","Psychology calls this personalization. Owning only your part frees energy for solving the problem.","Your Pisces ascendant absorbs others' problems, and Saturn's aspect on your ascendant adds self-criticism. Own your part, not the whole."],
["Overthinking","Moon","I keep replaying a conversation","Write it down, then close the notebook.","Writing moves the thought out of your head, so your mind stops rehearsing it.","Your Scorpio Moon loops on emotional events. Mercury, the writing planet, helps break the loop."],
["Overthinking","Moon","Someone's comment keeps hurting","Speak to them within 48 hours, or consciously let it go.","Unspoken hurt grows. Either clearing it or releasing it ends the cycle.","A Scorpio Moon remembers hurts for a long time. Holding on costs you more than them."],
["Overthinking","Rahu","Worries hit me at night","Write each worry and one next step. Deal with them in the morning.","Problems look bigger when you're tired. Morning-you will handle them better.","Rahu is linked with your 12th house (sleep), which amplifies night-time thoughts."],
["Overthinking","Moon","I feel someone is upset with me","Ask them directly and kindly instead of guessing.","Guesses are usually worse than reality, and asking shows maturity.","A Pisces ascendant senses moods but often misreads the cause, and a Scorpio Moon assumes the worst."],
["Overthinking","Jupiter","I made a mistake at work","Own it quickly, offer a fix, and move on.","Fast ownership builds more trust than a perfect record.","Jupiter, your ascendant lord, rewards honesty. Saturn rewards accountability, not self-punishment."],
["Overthinking","Rahu","I compare myself with others' success","Compare yourself only with who you were a year ago.","Other people's highlights aren't a fair benchmark for your full life.","Rahu in your 10th house breeds comparison. Saturn in your 11th means your gains come steadily and later, which is different timing, not less worth."],
["Overthinking","Saturn","I feel I'm not good enough","List three things you handled well this year.","Evidence beats feelings. Your track record is more reliable than your mood.","Saturn on your ascendant right now heightens self-doubt. It's a transit that eases by around mid-2027, not a verdict."],
["Anxiety & mood","Moon","I feel low for no clear reason","Walk for 20 minutes before judging anything.","Movement lifts mood reliably, and many low moods pass on their own.","Your Moon fluctuates by nature. Not every dip means something is wrong."],
["Anxiety & mood","Rahu","I'm anxious about the future","Write the worst case, the likely case, and one action for today.","Anxiety feeds on vagueness. A concrete action shrinks it.","Rahu creates fear of the unknown, and Saturn loves a plan. Planning satisfies both."],
["Anxiety & mood","Rahu","I'm scrolling my phone at night","Put it away and keep the phone outside the bedroom.","Screens delay sleep and feed comparison and worry.","Rahu rules screens and obsessive loops. Cutting the trigger weakens Rahu's grip."],
["Anxiety & mood","Moon","I've felt drained for weeks","Plan a 2\u20133 day trip.","A change of scene genuinely restores energy and perspective.","Your 3rd and 9th houses of travel are strongly activated, and the Moon in the 9th recharges through travel, temples and water."],
["Anxiety & mood","Ketu","I'm restless and want to change everything at once","Change one thing this week. The rest waits.","One change you can sustain beats five you abandon.","Rahu\u2013Ketu restlessness and your Jyeshtha tendency to take on too much push you toward big sweeps."],
["Anxiety & mood","Saturn","I feel stuck","Help someone today.","Helping others restores a sense of agency and often opens unexpected doors.","Saturn and Jupiter, your two career planets, both respond to service."],
["Anxiety & mood","Mercury","I feel overwhelmed by tasks","Write every task, pick the top 3, and ignore the rest for today.","A list turns a fog of pressure into a clear sequence.","Mercury is your weakest planet, so keeping everything in your head is costly. Saturn rewards order."],
["Work & boss","Sun","I disagree with my boss","Raise it privately, never in a meeting.","Bosses accept disagreement in private far more easily than in public.","Your Sun rules the 6th house of conflict, so clashes with authority come easily. Privacy keeps your strength without the fight."],
["Work & boss","Sun","My boss takes credit for my work","Send a short weekly email summarizing what you delivered.","It creates a visible record without confrontation.","The Sun needs recognition, and writing it down covers weak Mercury. Let results do the talking."],
["Work & boss","Rahu","Office gossip starts","Listen, add nothing, and change the topic.","Gossip always travels back, and staying neutral keeps you trusted by everyone.","Rahu in your career house and Jupiter in the 6th attract hidden rivals. Staying out keeps you safe."],
["Work & boss","Jupiter","A colleague undermines me","Stay factual, document everything, and escalate only with evidence.","Facts and records win workplace disputes; emotions lose them.","Jupiter in your 6th house classically defeats rivals through patience and fairness."],
["Work & boss","Jupiter","I'm asked to do something unethical","Decline politely and offer a correct alternative.","One shortcut can cost years of reputation.","Jupiter sits with Rahu in your career chart. That's a lifelong test of choosing the clean path."],
["Work & boss","Saturn","I'm given more work than I can handle","Ask, \u201cWhich of these should come first?\u201d instead of saying yes to everything.","Prioritizing out loud protects quality and shows judgment.","Saturn loads you with responsibility, and Pisces finds it hard to say no."],
["Work & boss","Moon","Someone asks for a favour I don't want to do","Say \u201cLet me check and get back to you,\u201d then decide calmly.","A pause turns a pressured yes into a real choice.","A Pisces ascendant tends to people-please. The delay protects your time."],
["Work & boss","Sun","I feel undervalued at work","Keep a running list of achievements and bring it to reviews.","Recognition goes to people who make their value visible.","The Sun, your strongest planet, needs recognition to thrive. Feed it with evidence, not complaints."],
["Work & boss","Mars","I'm starting a new job","For 90 days: listen more, promise less, and deliver early wins.","First impressions set your reputation for years.","The Mars sub-period right after your likely 2027 joining warns against overconfidence."],
["Career moves","Ketu","I feel like quitting","Wait 30 days, and quit only with an offer in hand.","Urges to quit often pass, and leaving without a plan weakens your position.","Ketu brings sudden urges to walk away, and your Varshaphal warns against abrupt moves."],
["Career moves","Moon","I want to tell people about my plan","Share the need with one trusted person, not the plan.","Early announcements invite opinions, pressure and jealousy, and can dull your drive.","A Scorpio Moon in Jyeshtha works best in private, and your Venus Mahadasha favors behind-the-scenes moves."],
["Career moves","Sun","Before an interview or big meeting","Walk, breathe 4-4-6, and review three achievement stories.","Calm body plus prepared stories equals confident delivery.","The Sun and Jupiter carry your career, and Thursdays and Sundays favor them."],
["Career moves","Mercury","Before explaining something important","Practise out loud first.","Rehearsal turns ideas into clear sentences.","Mercury is your weakest planet and Mars sharpens your delivery. Practice balances both."],
["Career moves","Saturn","I get rejected after an interview","Ask for feedback, note one lesson, and apply to two more that day.","Momentum is the best cure for rejection.","Saturn's signature in your chart is delay, not denial. Persistence is how Saturn pays out."],
["Career moves","Mercury","An offer arrives","Don't accept on the spot. Ask for it in writing and take 24\u201348 hours.","Offers rarely vanish in a day, and the pause lets you negotiate.","Weak Mercury means details slip under excitement. Read everything twice."],
["Career moves","Mars","I'm negotiating salary","State your number with reasons, then stay silent.","Silence after an ask is powerful; filling it weakens your position.","Mars in your 2nd house gives you courage in money talks. Use it calmly."],
["Career moves","Rahu","Something is going really well","Stay alert till it's done, then celebrate fully.","Mistakes happen when attention drops near the finish line.","Rahu in your 10th house brings sudden reversals, and your report notes you hurry. Focus is your protection."],
["Money","Mars","I want to buy something big","Wait 24 hours.","Impulse fades within a day; real needs remain.","Mars in your house of money brings impulsive spending, and the Venus Mahadasha loves comfort."],
["Money","Mercury","A quick-money tip arrives","Ignore it.","If it sounds fast and easy, the risk is hidden.","Mercury and Venus in your 5th house of speculation, with Mercury weak, make trading and betting your blind spot."],
["Money","Ketu","A friend asks for a loan","Lend only what you could give as a gift.","Then neither the money nor the friendship is at risk.","Ketu and your report both warn that some friends will disappoint you."],
["Money","Saturn","A raise or bonus arrives","Move a fixed share to savings the same day.","Lifestyle quietly expands to match income unless you save first.","Saturn in your 11th house builds wealth through steady accumulation, not windfalls."],
["Money","Venus","Festival or social spending pressure","Set a budget before the season starts.","Decisions made in advance hold up better than ones made in the moment.","Venus, your current Mahadasha lord, loves celebration and comfort."],
["Money","Rahu","I feel I must keep up with others' lifestyles","Ask, \u201cIs this for me or for them?\u201d","Spending for appearances rarely brings lasting satisfaction.","Rahu amplifies status hunger, and Venus amplifies comfort. Together they inflate spending."],
["Decisions","Mercury","Someone makes me a verbal promise","Confirm it by mail or message.","Memories differ; written records don't.","Mercury, your weakest planet, governs agreements."],
["Decisions","Mercury","I'm about to sign something","Read it twice and sleep on it.","Most contract regrets come from rushing.","Weak Mercury means details slip unless you slow down."],
["Decisions","Ketu","I want to start something new while another thing is half-done","Finish or consciously drop the old one first.","Two finished things are worth more than five half-done ones.","Your Jyeshtha reading notes you take on many things, and Ketu adds restlessness."],
["Decisions","Moon","I need to make a big decision while excited or upset","Decide only when calm, ideally after a night's sleep.","Strong emotions distort judgment in both directions.","A fluctuating Scorpio Moon plus quick Mars make in-the-moment decisions risky."],
["Decisions","Mercury","I have too many options and can't decide","Write pros and cons and set a decision date.","A deadline turns endless thinking into a choice.","Your report notes Pisces finds it hard to make up its mind, and Mercury needs structure."],
["Family","Moon","I disagree with my parents","Hear them out fully before replying.","People soften once they feel heard.","The Sun in your 4th house brings ego friction with parents. Listening first defuses it."],
["Family","Venus","My wife seems upset","Ask, listen, and don't rush to fix it.","Often the need is to be heard, not solved.","Mercury rules both your 4th (home) and 7th (spouse) houses, so harmony with her shapes your whole home life."],
["Family","Moon","I haven't called Mom or Dad in days","Call today.","Small regular contact keeps relationships close across distance.","The Moon (mother) in your 9th house (father) makes parents central to your peace."],
["Family","Moon","I want to withdraw and go silent","Say \u201cI need an hour,\u201d then come back.","Naming the pause prevents your silence from being misread as anger.","A Scorpio Moon retreats when hurt. A clear time limit keeps retreat from becoming distance."],
["Family","Mars","My child is acting up and I'm tired","Pause before reacting. Respond, don't react.","Children learn calm from watching it.","Mars gives a quick temper, and Ketu transiting your 5th house of children from December makes patience extra important."],
["Family","Mercury","A family decision about living together comes up","Discuss it with your wife first, then your parents.","Aligning as a couple first prevents conflict later.","Mercury rules both your home and spouse houses, so her comfort is central to joint living."],
["Family","Moon","A family member's health worries me","Act practically: book an appointment, check in. Worry less, do more.","Action reduces worry; worry alone changes nothing.","Your report flags family health in coming periods, and the Moon turns care into anxiety unless it's channeled."],
["Friends & social","Ketu","A friend lets me down","Lower your expectations, but don't cut them off. Keep it light.","Most friendships survive disappointment if expectations are adjusted.","Ketu and your report indicate some friends won't deliver. Choose who to rely on, not who to drop."],
["Friends & social","Moon","I'm invited out but feel like isolating","Go for one hour.","Connection reliably lifts mood, even when you don't feel like it.","A Scorpio Moon withdraws, but a good social life is one of your stated goals."],
["Friends & social","Rahu","I want to vent about someone to friends","Vent to your journal or your wife, not the group.","Group venting spreads and comes back to you.","Your Scorpio nature thrives in privacy, and Rahu makes reputation sensitive."],
["Friends & social","Mercury","A friend proposes a business together","Put terms in writing and keep money separate.","Clear terms protect both the deal and the friendship.","Your 7th house of partnerships is weak, so structure matters more for you."],
["Wins & setbacks","Sun","I receive praise","Say thank you, credit the team, and keep it to yourself beyond that.","Gracious success builds goodwill; boasting builds rivals.","The Sun loves praise, but your own rule warns that celebrating early backfires."],
["Wins & setbacks","Saturn","A big setback hits","Give yourself one day to feel it, then write the next step.","Feelings need room, but a time limit keeps them from taking over.","Your chart gives slowly but surely. Saturn tests, then rewards persistence."],
["Wins & setbacks","Jupiter","I achieve a goal","Celebrate fully, then share credit and give something back.","Celebrating finished wins builds motivation for the next one.","Jupiter rewards gratitude, and your Moon in the 9th house loves giving back."]
];

async function importGuide(){
  if(!gdLoaded){ showToast('Still loading your guide from the Sheet. Try again in a moment.','error'); return; }
  // Never add a situation that is already in the guide
  var have={}; guide.forEach(function(g){ have[gdKey(g.situation,g.action)]=1; });
  var seeds=GUIDE_SEED.map(function(r,i){ return {r:r,i:i}; })
    .filter(function(x){ return !have[gdKey(x.r[2],x.r[3])]; });
  if(!seeds.length){ showToast('All '+GUIDE_SEED.length+' situations are already in your guide.',''); return; }
  if(guide.length && !confirm('Add the '+seeds.length+' starter situations that aren\u2019t in your guide yet?')) return;
  var btn=document.getElementById('gd-sync');
  var total=seeds.length, added=0;
  for(var si=0;si<total;si++){
    var r=seeds[si].r, i=seeds[si].i;
    var id='g'+(Date.now()+i);
    guide.push({sheetId:id,category:r[0],planet:r[1],situation:r[2],action:r[3],why:r[4],astro:r[5],order:i,starred:false});
    var ok=await postToSheet({sheet:'Guide',sheetId:id,category:r[0],planet:r[1],
      situation:r[2],action_text:r[3],why:r[4],astro:r[5],order:i});
    if(ok) added++;
    if(btn){ btn.textContent='Importing '+(si+1)+' of '+total+'\u2026'; btn.className='sync-txt syncing'; }
    if(si%10===0) renderGuide();
  }
  renderGuide();
  if(btn){ btn.textContent=added+' of '+total+' imported'+(added===total?' \u2713':''); btn.className='sync-txt '+(added===total?'ok':'err'); }
  showToast(added+' situations imported \u2713','success');
}

/* ── Collapsible sections ─────────────────────────────────
   Open/closed state is a display preference, so it lives in
   localStorage — no dashboard data is stored there.
──────────────────────────────────────────────────────── */
var SEC_KEYS=['links','sitlib','master','routine','food','foodsum','weekly','library','rtstats','habitperf','habits','checklist','pillars','anchors'];

function secOpen(key){
  var v=localStorage.getItem('sec_'+key);
  // Reference material starts closed; the things you act on daily
  // start open. Badges on the headers mean nothing is truly hidden.
  if(v===null) return ['checklist','anchors','master','pillars','habitperf','sitlib','foodsum','library','links'].indexOf(key)===-1;
  return v==='1';
}

function applySection(key){
  var body=document.getElementById('sec-'+key);
  var caret=document.getElementById('caret-'+key);
  var hd=document.getElementById('hd-'+key);
  if(!body) return;
  var open=secOpen(key);
  body.classList.toggle('closed',!open);
  if(caret) caret.classList.toggle('open',open);
  if(hd) hd.classList.toggle('open',open);
}

function toggleSection(key){
  localStorage.setItem('sec_'+key, secOpen(key)?'0':'1');
  applySection(key);
  updateSectionBadges();
}

function initSections(){ SEC_KEYS.forEach(applySection); updateSectionBadges(); }

/* Badges keep a collapsed section informative */
function updateSectionBadges(){
  function set(key,txt,done){
    var el=document.getElementById('badge-'+key); if(!el) return;
    el.textContent=txt||'';
    el.classList.toggle('done',!!done);
    el.style.display=txt?'':'none';
  }
  var d=selDate||isoToday();
  var items=itemsFor(activeRoutine);
  var ids=items.map(function(i){ return i.habitId; });
  var rdone=doneFor(activeRoutine,d).filter(function(x){ return ids.indexOf(x)>-1; }).length;
  set('routine', items.length? rdone+'/'+items.length : '', items.length&&rdone===items.length);
  set('rtstats','');
  set('master', habitMaster.length? String(habitMaster.length) : '');

  var hDone=(habitDone[isoToday()]||[]).length;
  set('habits', habitList.length? hDone+'/'+habitList.length : '', habitList.length&&hDone===habitList.length);

  var cDone=CHECKLIST.filter(function(i){return checked[i.k];}).length;
  set('checklist', cDone+'/'+CHECKLIST.length, cDone===CHECKLIST.length);

  set('links',''); set('pillars',''); set('anchors','');
  set('sitlib', sitPlans.filter(function(p){return p.status==='active';}).length||'');

  renderGlance();
}

/* ── Today at a glance ─────────────────────────────────── */
function renderGlance(){
  var el=document.getElementById('glance'); if(!el) return;
  var d=selDate||isoToday();
  var items=itemsFor(activeRoutine);
  var ids=items.map(function(i){ return i.habitId; });
  var rdone=doneFor(activeRoutine,d).filter(function(x){ return ids.indexOf(x)>-1; }).length;
  var hDone=(habitDone[isoToday()]||[]).length;
  var cDone=CHECKLIST.filter(function(i){return checked[i.k];}).length;

  function card(n,total,label,key){
    var pct=total?Math.round(n/total*100):0;
    var full=total>0&&n===total;
    return '<div class="gl-card" onclick="jumpToSection(\''+key+'\')">'+
      '<div class="gl-n'+(full?' done':'')+'">'+n+'<span style="font-size:.7em;color:var(--text-3)">/'+total+'</span></div>'+
      '<div class="gl-l">'+label+'</div>'+
      '<div class="gl-bar"><div class="gl-fill" style="width:'+pct+'%"></div></div></div>';
  }
  var fList=(typeof foodListOn==='function')?foodListOn(isoToday()):[];
  var fDone=fList.filter(function(h){ return foodKept(h.sheetId,isoToday()); }).length;
  el.innerHTML=card(rdone,items.length,'Routine','routine')+
    card(fDone,fList.length,'Food','food')+
    card(hDone,habitList.length,'Habits','habits')+
    card(cDone,CHECKLIST.length,'Checklist','checklist');
}

/* Sections now live on two tabs, so a glance card may need to
   switch tab before scrolling to its section. */
var ROUTINE_TAB_SECTIONS=['master','routine','food','foodsum','rtstats','habitperf'];   // sitlib lives on Home

function jumpToSection(key){
  if(!secOpen(key)){ localStorage.setItem('sec_'+key,'1'); applySection(key); }
  var needsRoutineTab = ROUTINE_TAB_SECTIONS.indexOf(key)>-1;
  var onRoutineTab = document.getElementById('pg-routine').classList.contains('on');
  if(needsRoutineTab && !onRoutineTab){ switchTab('routine'); }
  else if(!needsRoutineTab && onRoutineTab){ switchTab('morning'); }
  setTimeout(function(){
    var hd=document.getElementById('hd-'+key);
    if(hd) hd.scrollIntoView({behavior:'smooth',block:'start'});
  },60);
}

/* ═══════════════════════════════════════════════════
   ROUTINES — master library + dated membership

   habitMaster  : [{sheetId, time, habit}]         the library
   routineItems : [{sheetId, routine, habitId,     membership,
                    order, addedOn, removedOn}]    date-ranged
   routineDay   : {dateISO: routineName}           which ran that day
   routineLog   : {dateISO: {routine: [habitId]}}  what got done

   Membership carries addedOn/removedOn, so a habit added today is
   never counted against last month. Every figure resolves the
   routine's contents AS OF the day being measured.
═══════════════════════════════════════════════════ */
var habitMaster=[];
var routineItems=[];
var routineLog={};
var routineDay={};
var extraRoutines=[];
var activeRoutine='';
var selDate='';

var CAL_BACK=7, CAL_FWD=21;
var _calNeedsScroll=true;   // recentre the strip only on load / date change

function calDates(){
  var out=[], d=new Date(); d.setDate(d.getDate()-CAL_BACK);
  for(var i=0;i<CAL_BACK+1+CAL_FWD;i++){ out.push(isoDate(d)); d.setDate(d.getDate()+1); }
  return out;
}

/* Sheets may hand back a full Date string for a time cell.
   Reduce anything like "Sat Dec 30 1899 06:00:00 GMT+0521" to "6:00 AM". */
function cleanTime(t){
  if(!t) return '';
  var s=String(t).trim();
  var m=s.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\b/);
  if(s.length>12 && m){
    var h=parseInt(m[1],10), mn=m[2];
    var ap=h<12?'AM':'PM'; var h12=h%12; if(h12===0) h12=12;
    return h12+':'+mn+' '+ap;
  }
  return s;
}

function masterById(id){ return habitMaster.find(function(h){ return h.sheetId===id; }); }

function routineNames(){
  var names=[];
  routineItems.forEach(function(m){ if(m.routine && names.indexOf(m.routine)===-1) names.push(m.routine); });
  Object.keys(routineDay).forEach(function(d){
    var r=routineDay[d]; if(r && names.indexOf(r)===-1) names.push(r);
  });
  extraRoutines.forEach(function(r){ if(r && names.indexOf(r)===-1) names.push(r); });
  if(activeRoutine && names.indexOf(activeRoutine)===-1) names.push(activeRoutine);
  if(!names.length) names=['Routine 1'];
  return names.sort();
}

/* THE KEY FUNCTION — which habits were in this routine on this date:
   added on or before it, and not yet removed as of it. */
function itemsOn(routine,iso){
  return routineItems.filter(function(m){
    if(m.routine!==routine) return false;
    if(m.addedOn && m.addedOn>iso) return false;
    if(m.removedOn && m.removedOn<=iso) return false;
    return true;
  }).sort(function(a,b){ return a.order-b.order; })
    .map(function(m){
      var h=masterById(m.habitId)||{};
      return {memberId:m.sheetId,habitId:m.habitId,time:h.time||'',
        habit:h.habit||'(not in library)',order:m.order};
    });
}

function itemsFor(name){ return itemsOn(name, selDate||isoToday()); }

/* Minutes since midnight. Deliberately forgiving: the meridiem is
   searched for anywhere in the string rather than required in
   sequence, so "4:00 PM", "4.00pm", "4 PM" and a stray non-breaking
   space all resolve the same. Blank or unparseable sorts last. */
function timeToMin(t){
  if(!t) return 99999;
  // Normalise every flavour of unicode space down to a plain one
  var s=cleanTime(t).toUpperCase().replace(/[\s\u00a0\u202f\u2000-\u200a]+/g,' ').trim();
  if(!s) return 99999;

  var isPM=/\bP\.?M\.?\b|PM/.test(s);
  var isAM=/\bA\.?M\.?\b|AM/.test(s);

  var m=s.match(/(\d{1,2})\s*[:.\s]?\s*(\d{2})?/);
  if(!m) return 99999;

  var h=parseInt(m[1],10);
  var min=m[2]?parseInt(m[2],10):0;
  if(isNaN(h)||h>23||min>59) return 99999;

  if(isPM && h<12) h+=12;     // 4 PM  -> 16
  if(isAM && h===12) h=0;     // 12 AM -> 00
  return h*60+min;
}

function doneFor(name,iso){ return (routineLog[iso]&&routineLog[iso][name])||[]; }

function routineForDate(iso){
  if(routineDay[iso]) return routineDay[iso];
  var prior=Object.keys(routineDay).filter(function(k){ return k<iso; }).sort();
  if(prior.length) return routineDay[prior[prior.length-1]];
  return routineNames()[0];
}

function fmtDayLabel(iso){
  var p=iso.split('-'), d=new Date(+p[0],+p[1]-1,+p[2]);
  return (iso===isoToday()?'Today \u00b7 ':'')+d.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long'});
}

/* ── Master library ─────────────────────────────────────── */
function renderMaster(){
  var el=document.getElementById('mstr-list'); if(!el) return;
  if(!habitMaster.length){
    el.innerHTML='<div class="rt-empty">No habits yet. Add one below, then pick from here when building a routine.</div>';
    return;
  }
  var sorted=habitMaster.slice().sort(function(a,b){
    var d=timeToMin(a.time)-timeToMin(b.time);
    if(d!==0) return d;
    return (a.habit||'').localeCompare(b.habit||'');   // same time -> alphabetical
  });
  el.innerHTML=sorted.map(function(h){
    var used=routineItems.filter(function(m){ return m.habitId===h.sheetId && !m.removedOn; })
      .map(function(m){ return m.routine.replace(/routine\s*/i,'R'); });
    var tag=used.length?'<span class="mstr-in">'+escH(used.join(' \u00b7 '))+'</span>'
                       :'<span class="mstr-in unused">unused</span>';
    return '<div class="mstr-row">'+
      '<div class="mstr-time">'+escH(cleanTime(h.time)||'\u2014')+'</div>'+
      '<div class="mstr-name">'+escH(h.habit)+'</div>'+tag+
      '<div class="mstr-acts">'+
        '<button class="rt-mini" onclick="editMaster(\''+h.sheetId+'\')" title="Edit">\u270e</button>'+
        '<button class="rt-mini del" onclick="delMaster(\''+h.sheetId+'\')" title="Delete">\u00d7</button>'+
      '</div></div>';
  }).join('');
}

function addMaster(){
  var t=document.getElementById('mstr-time').value.trim();
  var h=document.getElementById('mstr-habit').value.trim();
  if(!h){ showToast('Name the habit first.','error'); return; }
  var id='m'+Date.now();
  habitMaster.push({sheetId:id,time:t,habit:h});
  document.getElementById('mstr-time').value='';
  document.getElementById('mstr-habit').value='';
  renderMaster(); renderRoutine();
  rtSync(postToSheet({sheet:'HabitMaster',sheetId:id,time:t,habit:h}));
}

function editMaster(id){
  var h=masterById(id); if(!h) return;
  var html='<div style="margin-bottom:10px"><label class="sfl">Time</label>'+
    '<input class="sin" id="edit-m-time" type="text" value="'+escH(h.time||'')+'" placeholder="6:30 AM"></div>'+
    '<div><label class="sfl">Habit</label>'+
    '<textarea class="sin" id="edit-m-habit" rows="3">'+escH(h.habit||'')+'</textarea></div>'+
    '<div style="font-size:11px;color:var(--text-3);margin-top:8px;line-height:1.6">Editing here updates this habit in every routine that uses it.</div>';
  openEditModal('Edit habit',html,{type:'master',id:id});
}

async function delMaster(id){
  var h=masterById(id); if(!h) return;
  var inUse=routineItems.filter(function(m){ return m.habitId===id && !m.removedOn; });
  var warn=inUse.length?'\n\nIt is in '+inUse.length+' routine'+(inUse.length>1?'s':'')+'. Past history is kept.':'';
  if(!confirm('Delete "'+h.habit+'" from the master list?'+warn)) return;
  habitMaster=habitMaster.filter(function(x){ return x.sheetId!==id; });
  renderMaster(); renderRoutine();
  await postToSheet({sheet:'HabitMaster',action:'delete_master',sheetId:id});
  showToast('Deleted from library.','');
}

/* ── Routine + calendar ─────────────────────────────────── */
function selectRoutine(name){
  activeRoutine=name;
  if(!selDate) selDate=isoToday();
  routineDay[selDate]=name;
  renderRoutine();
  var p=selDate.split('-'), dd=new Date(+p[0],+p[1]-1,+p[2]);
  rtSync(postToSheet({sheet:'RoutineDay',
    date:dd.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}),
    dateISO:selDate,routine:name}));
}

function selectDate(iso){ selDate=iso; activeRoutine=routineForDate(iso); _calNeedsScroll=true; renderRoutine(); renderFood(); }

function newRoutine(){
  var n=prompt('Name the new routine:','Routine '+(routineNames().length+1));
  if(!n||!n.trim()) return;
  n=n.trim();
  if(routineNames().indexOf(n)>-1){ showToast('That routine already exists.','error'); return; }
  extraRoutines.push(n); activeRoutine=n; renderRoutine();
  showToast('Now add habits from your master list.','');
}

/* Renaming rewrites the name in all three routine sheets, so every
   past day, its completion record and every future assignment follow
   the new name. Nothing is orphaned under the old one. */
/* Read today's row straight back from the Sheet and compare it to
   what the page is showing. Settles "did it save?" against "did it
   load?" without guesswork. */
async function verifyRoutineLog(){
  var d=selDate||isoToday();
  var el=document.getElementById('rt-sync');
  if(el){ el.textContent='Checking the Sheet\u2026'; el.className='sync-txt syncing'; }

  // Force any pending write out first
  if(_rlTimer){ clearTimeout(_rlTimer); await flushRoutineLog(); }

  var res=await sheetFetch(WORKER_URL+'?action=getAllRoutineLogs');
  if(!res||res.status!=='ok'||!Array.isArray(res.routineLog)){
    if(el){ el.textContent='Could not read the Sheet'; el.className='sync-txt err'; }
    showToast('Sheet unreachable \u2014 nothing was verified.','error');
    return;
  }

  var row=res.routineLog.filter(function(r){
    return r.dateISO===d && r.routine===activeRoutine; })[0];

  var items=itemsOn(activeRoutine,d);
  var byId={}; items.forEach(function(i){ byId[i.habitId]=i.habit; });

  var sheetYes=row?String(row.done||'').split(',').map(function(s){return s.trim();}).filter(Boolean):[];
  var sheetMiss={};
  if(row) String(row.missed||'').split('||').forEach(function(p){
    if(!p.trim())return; var b=p.split('~~');
    if(b[0]&&b[0].trim()) sheetMiss[b[0].trim()]=(b[1]||'').trim();
  });

  var pageYes=doneFor(activeRoutine,d);
  var pageMiss=missFor(activeRoutine,d);

  var lines=[
    'Day: '+d+'   Routine: '+activeRoutine,
    row ? 'Row found in RoutineLog \u2713' : 'NO ROW in RoutineLog for this day \u2717',
    '',
    'In the Sheet   \u2014 yes: '+sheetYes.length+', no: '+Object.keys(sheetMiss).length,
    'On this page   \u2014 yes: '+pageYes.length+', no: '+Object.keys(pageMiss).length,
    ''
  ];

  items.forEach(function(i){
    var sState = sheetYes.indexOf(i.habitId)>-1 ? 'YES'
               : (Object.prototype.hasOwnProperty.call(sheetMiss,i.habitId) ? 'NO' : '\u2013');
    var pState = pageYes.indexOf(i.habitId)>-1 ? 'YES'
               : (Object.prototype.hasOwnProperty.call(pageMiss,i.habitId) ? 'NO' : '\u2013');
    var why = sheetMiss[i.habitId] ? '  ("'+sheetMiss[i.habitId]+'")' : '';
    var flag = sState===pState ? '' : '   <-- MISMATCH';
    lines.push('  sheet '+sState.padEnd(4)+' | page '+pState.padEnd(4)+'  '+i.habit+why+flag);
  });

  var mismatch = items.some(function(i){
    var s = sheetYes.indexOf(i.habitId)>-1?'YES':(Object.prototype.hasOwnProperty.call(sheetMiss,i.habitId)?'NO':'-');
    var p = pageYes.indexOf(i.habitId)>-1?'YES':(Object.prototype.hasOwnProperty.call(pageMiss,i.habitId)?'NO':'-');
    return s!==p;
  });

  lines.push('');
  lines.push(mismatch
    ? 'Sheet and page disagree \u2014 the load path is dropping data.'
    : 'Sheet matches the page \u2014 saving is working. If it vanishes after refresh, the load path is at fault.');

  openEditModal('Sheet check',
    '<pre style="font-family:var(--fm);font-size:11px;color:var(--text-2);white-space:pre-wrap;line-height:1.7;margin:0">'+
    escH(lines.join('\n'))+'</pre>', {type:'diag'});

  if(el){ el.textContent=mismatch?'Mismatch \u2014 see the report':'Sheet matches \u2713';
          el.className='sync-txt '+(mismatch?'err':'ok'); }
}

async function renameRoutine(){
  if(!activeRoutine) return;
  var n=prompt('Rename this routine:\n\nApplies to every past and future day.',activeRoutine);
  if(!n||!n.trim()||n.trim()===activeRoutine) return;
  n=n.trim();
  if(routineNames().indexOf(n)>-1){ showToast('That name is already used.','error'); return; }
  var oldName=activeRoutine;

  // Count what will move, so the toast can be specific
  var dayCount=Object.keys(routineDay).filter(function(d){ return routineDay[d]===oldName; }).length;
  var logCount=Object.keys(routineLog).filter(function(d){ return routineLog[d][oldName]; }).length;

  // Local state first, so the UI responds immediately
  extraRoutines=extraRoutines.map(function(r){ return r===oldName?n:r; });
  routineItems.forEach(function(m){ if(m.routine===oldName) m.routine=n; });
  Object.keys(routineDay).forEach(function(d){ if(routineDay[d]===oldName) routineDay[d]=n; });
  Object.keys(routineLog).forEach(function(d){
    if(routineLog[d][oldName]){ routineLog[d][n]=routineLog[d][oldName]; delete routineLog[d][oldName]; }
  });
  activeRoutine=n;
  _calNeedsScroll=false;
  renderRoutine();

  // Then all three sheets
  var el=document.getElementById('rt-sync');
  if(el){ el.textContent='Renaming everywhere\u2026'; el.className='sync-txt syncing'; }
  var r1=await postToSheet({sheet:'RoutineItems',action:'rename_routine_items',oldName:oldName,newName:n});
  var r2=await postToSheet({sheet:'RoutineDay', action:'rename_routine_days', oldName:oldName,newName:n});
  var r3=await postToSheet({sheet:'RoutineLog', action:'rename_routine_log',  oldName:oldName,newName:n});
  var ok=r1&&r2&&r3;

  if(el){ el.textContent=ok?'Renamed everywhere \u2713':'Renamed locally \u2014 sync incomplete';
          el.className='sync-txt '+(ok?'ok':'err'); }
  showToast(ok
    ? 'Renamed to "'+n+'" \u00b7 '+dayCount+' day'+(dayCount!==1?'s':'')+', '+logCount+' logged'
    : 'Renamed locally \u2014 Sheet sync failed.', ok?'success':'error');
}

async function deleteRoutine(){
  if(!activeRoutine) return;
  if(routineNames().length<=1){ showToast('Keep at least one routine.','error'); return; }
  var gone=activeRoutine, today=selDate||isoToday();
  var n=itemsOn(gone,today).length;
  if(!confirm('Delete "'+gone+'"'+(n?' and its '+n+' habit'+(n>1?'s':''):'')+'?\n\nCompletion history is kept.')) return;
  routineItems.filter(function(m){ return m.routine===gone && !m.removedOn; })
    .forEach(function(m){ m.removedOn=today;
      postToSheet({sheet:'RoutineItems',action:'remove_item',sheetId:m.sheetId,removedOn:today}); });
  extraRoutines=extraRoutines.filter(function(r){ return r!==gone; });
  activeRoutine=''; renderRoutine();
  showToast('Deleted "'+gone+'".','');
}

function renderCalendar(){
  var el=document.getElementById('rt-cal'); if(!el) return;
  var today=isoToday();
  if(!selDate) selDate=today;
  el.innerHTML=calDates().map(function(iso){
    var p=iso.split('-'), d=new Date(+p[0],+p[1]-1,+p[2]);
    var rt=routineForDate(iso);
    var items=itemsOn(rt,iso);
    var ids=items.map(function(i){ return i.habitId; });
    var hit=doneFor(rt,iso).filter(function(x){ return ids.indexOf(x)>-1; }).length;
    var total=items.length, pct=total?hit/total:0;
    var col=(total&&hit===total)?'var(--green)':(hit>0?'var(--gold)':'rgba(255,255,255,0.12)');
    var R=9, CIRC=2*Math.PI*R, dash=(pct*CIRC).toFixed(1)+' '+CIRC.toFixed(1);
    return '<div class="rt-cal-day'+(iso===selDate?' sel':'')+(iso===today?' today':'')+'" onclick="selectDate(\''+iso+'\')">'+
      '<div class="rt-cal-dow">'+d.toLocaleDateString('en-IN',{weekday:'short'}).slice(0,3)+'</div>'+
      '<div class="rt-cal-num">'+d.getDate()+'</div>'+
      '<div class="rt-cal-tag">'+escH((rt||'').replace(/routine\s*/i,'R'))+'</div>'+
      '<div class="rt-cal-ring"><svg width="22" height="22" viewBox="0 0 22 22">'+
        '<circle class="rt-cal-ring-bg" cx="11" cy="11" r="'+R+'" fill="none" stroke-width="2.5"/>'+
        '<circle class="rt-cal-ring-fg" cx="11" cy="11" r="'+R+'" fill="none" stroke="'+col+'" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="'+dash+'"/>'+
      '</svg><div class="rt-cal-cnt">'+(total?hit+'/'+total:'\u2013')+'</div></div></div>';
  }).join('');
  /* Centre the selected day by moving the strip's own scrollLeft.
     scrollIntoView() would scroll the PAGE too, which yanked the
     view to the top every time a habit was ticked. */
  if(_calNeedsScroll){
    var sel=el.querySelector('.rt-cal-day.sel');
    if(sel){
      var target=sel.offsetLeft-(el.clientWidth/2)+(sel.offsetWidth/2);
      el.scrollLeft=Math.max(0,target);
    }
    _calNeedsScroll=false;
  }
  var lbl=document.getElementById('rt-daylbl');
  if(lbl) lbl.textContent=fmtDayLabel(selDate);
  // Offer a way back when looking at another day
  var tb=document.getElementById('rt-today-btn');
  if(tb) tb.style.display = (selDate===today) ? 'none' : '';
}

function renderRoutineSelector(){
  var el=document.getElementById('rt-selector'); if(!el) return;
  var names=routineNames();
  if(!activeRoutine||names.indexOf(activeRoutine)===-1) activeRoutine=names[0];
  el.innerHTML=names.map(function(n){
    return '<button class="rt-pill'+(n===activeRoutine?' on':'')+'" onclick="selectRoutine(\''+escH(n).replace(/'/g,"\\'")+'\')">'+escH(n)+'</button>';
  }).join('')+'<button class="rt-pill add" onclick="newRoutine()">+ New routine</button>';
}

function renderRoutine(){
  if(!selDate) selDate=isoToday();
  if(!activeRoutine) activeRoutine=routineForDate(selDate);
  renderCalendar(); renderRoutineSelector(); renderMasterPicker();
  var box=document.getElementById('rt-items'); if(!box) return;
  var items=itemsFor(activeRoutine);
  var done=doneFor(activeRoutine,selDate);

  if(!items.length){
    box.innerHTML='<div class="rt-empty">No habits in <strong>'+escH(activeRoutine)+'</strong> for this day.<br>Add some from your master list below.</div>';
    var pr=document.getElementById('rt-progress'); if(pr) pr.innerHTML='';
    renderRoutineHistory();
    if(window.updateSectionBadges) updateSectionBadges();
    return;
  }

  box.innerHTML=items.map(function(it,idx){
    var state=habitState(it.habitId,selDate);
    return '<div class="rt-row'+(state==='yes'?' done':'')+(state==='no'?' missed':'')+'" data-idx="'+idx+'">'+
      '<span class="rt-grip" onpointerdown="startRtDrag(event,'+idx+')" title="Drag to reorder">\u2630</span>'+
      '<div class="rt-time">'+escH(cleanTime(it.time)||'\u2014')+'</div>'+
      '<div class="rt-hab">'+escH(it.habit)+'</div>'+
      '<div class="rt-acts">'+
        '<button class="rt-mini del" onclick="removeFromRoutine(\''+it.memberId+'\')" title="Remove from this routine">\u00d7</button>'+
        '<div class="yn">'+
          '<button class="yn-b yes'+(state==='yes'?' on':'')+'" onclick="setHabitState(\''+it.habitId+'\',\'yes\')">Yes</button>'+
          '<button class="yn-b no'+(state==='no'?' on':'')+'" onclick="setHabitState(\''+it.habitId+'\',\'no\')">No</button>'+
        '</div>'+
      '</div>'+
      (state==='no' ? reasonRowHTML(it.habitId) : '')+
    '</div>';
  }).join('');

  var hit=done.filter(function(x){ return items.some(function(i){ return i.habitId===x; }); }).length;
  var pct=Math.round(hit/items.length*100);
  var dayWord=selDate===isoToday()?'today':fmtDayLabel(selDate).replace(/^Today \u00b7 /,'');
  document.getElementById('rt-progress').innerHTML=
    '<div class="prog-meta"><span>'+escH(activeRoutine)+' \u00b7 '+escH(dayWord)+'</span>'+
    '<span class="prog-ct">'+hit+'/'+items.length+'</span></div>'+
    '<div class="prog-track"><div class="prog-fill" style="width:'+pct+'%"></div></div>';

  renderRoutineHistory();
  renderHabitPerf();
  if(window.updateSectionBadges) updateSectionBadges();
}

function renderMasterPicker(){
  var el=document.getElementById('rt-picker'); if(!el) return;
  var inR=itemsFor(activeRoutine).map(function(i){ return i.habitId; });
  var avail=habitMaster.filter(function(h){ return inR.indexOf(h.sheetId)===-1; })
    .sort(function(a,b){
      var d=timeToMin(a.time)-timeToMin(b.time);
      if(d!==0) return d;
      return (a.habit||'').localeCompare(b.habit||'');
    });
  if(!avail.length){
    el.innerHTML='<div style="font-size:11px;color:var(--text-3);padding:4px 0">'+
      (habitMaster.length?'Every habit in your library is already in this routine.':'Your master list is empty \u2014 add habits below.')+'</div>';
    return;
  }
  var from=selDate||isoToday();
  var lbl = from===isoToday() ? 'Add from master list'
          : 'Add from master list \u2014 starts '+fmtDayLabel(from).replace(/^Today \u00b7 /,'');
  el.innerHTML='<div class="rt-pick-lbl">'+escH(lbl)+'</div><div class="rt-pick-chips">'+
    avail.map(function(h){
      return '<button class="rt-chip" onclick="addToRoutine(\''+h.sheetId+'\')">+ '+
        (h.time?'<span class="rt-chip-t">'+escH(cleanTime(h.time))+'</span> ':'')+escH(h.habit)+'</button>';
    }).join('')+'</div>';
}

/* Adding stamps the day you are VIEWING, not today. Add a habit
   while looking at 7 Sep and it joins on the 7th — the 6th and
   everything before it keep their original denominator. */
function addToRoutine(habitId){
  var from=selDate||isoToday(), id='ri'+Date.now();
  var order=itemsFor(activeRoutine).length;
  routineItems.push({sheetId:id,routine:activeRoutine,habitId:habitId,order:order,addedOn:from,removedOn:''});
  renderRoutine();
  var h=masterById(habitId)||{};
  if(from!==isoToday()){
    showToast('"'+(h.habit||'Habit')+'" added from '+fmtDayLabel(from).replace(/^Today \u00b7 /,'')+' onward.','success');
  }
  rtSync(postToSheet({sheet:'RoutineItems',sheetId:id,routine:activeRoutine,
    habitId:habitId,order:order,addedOn:from}));
}

/* Removing stamps a leave date rather than deleting the link */
function removeFromRoutine(memberId){
  var m=routineItems.find(function(x){ return x.sheetId===memberId; }); if(!m) return;
  var h=masterById(m.habitId)||{};
  var from=selDate||isoToday();
  var when = from===isoToday() ? 'today' : fmtDayLabel(from).replace(/^Today \u00b7 /,'');
  if(!confirm('Remove "'+(h.habit||'this habit')+'" from '+activeRoutine+' from '+when+' onward?\n\nEarlier days keep it in their record.')) return;
  // If it never ran before this day, drop the link entirely
  if(m.addedOn && m.addedOn>=from){
    routineItems=routineItems.filter(function(x){ return x.sheetId!==memberId; });
    renderRoutine();
    rtSync(postToSheet({sheet:'RoutineItems',action:'remove_item',sheetId:memberId,removedOn:m.addedOn}));
    return;
  }
  m.removedOn=from;
  renderRoutine();
  rtSync(postToSheet({sheet:'RoutineItems',action:'remove_item',sheetId:memberId,removedOn:from}));
}

/* ── Yes / No / untouched ────────────────────────────────
   Three states, not two. "No" is an explicit miss with a
   reason attached; untouched simply hasn't been answered.
   Only "yes" counts toward completion.

   routineLog  [iso][routine] = [habitId...]        answered yes
   routineMiss [iso][routine] = {habitId: reason}   answered no
──────────────────────────────────────────────────────── */
var routineMiss={};
var habitReasons=[];   // [{sheetId, habitId, reason}]

function missFor(routine,iso){ return (routineMiss[iso]&&routineMiss[iso][routine])||{}; }

function habitState(habitId,iso){
  var d=iso||selDate||isoToday();
  if(doneFor(activeRoutine,d).indexOf(habitId)>-1) return 'yes';
  if(Object.prototype.hasOwnProperty.call(missFor(activeRoutine,d),habitId)) return 'no';
  return '';
}

function reasonsFor(habitId){
  return habitReasons.filter(function(r){ return r.habitId===habitId; })
    .map(function(r){ return r.reason; });
}

/* The reason line shown beneath a habit answered "No" */
function reasonRowHTML(habitId){
  var d=selDate||isoToday();
  var cur=missFor(activeRoutine,d)[habitId]||'';
  var opts=reasonsFor(habitId);
  if(opts.indexOf(cur)===-1 && cur) opts=[cur].concat(opts);
  var sel='<select class="rsn-sel" onchange="pickReason(\''+habitId+'\',this)">'+
    '<option value=""'+(cur?'':' selected')+'>Why not?</option>'+
    opts.map(function(o){
      return '<option value="'+escH(o)+'"'+(o===cur?' selected':'')+'>'+escH(o)+'</option>';
    }).join('')+
    '<option value="__new">+ Add a new reason\u2026</option></select>';
  return '<div class="rsn"><span class="rsn-lbl">Reason</span>'+sel+'</div>';
}

function setHabitState(habitId,want){
  var d=selDate||isoToday();
  if(!routineLog[d]) routineLog[d]={};
  if(!routineLog[d][activeRoutine]) routineLog[d][activeRoutine]=[];
  if(!routineMiss[d]) routineMiss[d]={};
  if(!routineMiss[d][activeRoutine]) routineMiss[d][activeRoutine]={};

  var yesArr=routineLog[d][activeRoutine];
  var missMap=routineMiss[d][activeRoutine];
  var cur=habitState(habitId,d);

  // Tapping the active answer clears it back to unanswered
  var next = (cur===want) ? '' : want;

  var ix=yesArr.indexOf(habitId);
  if(ix>-1) yesArr.splice(ix,1);
  delete missMap[habitId];

  if(next==='yes') yesArr.push(habitId);
  if(next==='no')  missMap[habitId]='';

  renderRoutineRows();
  saveRoutineLog();
}

function pickReason(habitId,sel){
  var d=selDate||isoToday();
  var val=sel.value;

  if(val==='__new'){
    var r=prompt('New reason for this habit:');
    if(!r||!r.trim()){ renderRoutineRows(); return; }
    r=r.trim();
    if(reasonsFor(habitId).indexOf(r)===-1){
      var id='rs'+Date.now();
      habitReasons.push({sheetId:id,habitId:habitId,reason:r});
      postToSheet({sheet:'HabitReasons',sheetId:id,habitId:habitId,reason:r});
    }
    val=r;
  }

  if(!routineMiss[d]) routineMiss[d]={};
  if(!routineMiss[d][activeRoutine]) routineMiss[d][activeRoutine]={};
  routineMiss[d][activeRoutine][habitId]=val;
  renderRoutineRows();
  saveRoutineLog();
}

/* Redraw only the habit rows, leaving scroll position alone */
function renderRoutineRows(){
  var box=document.getElementById('rt-items'); if(!box) return;
  var items=itemsFor(activeRoutine);
  if(!items.length){ renderRoutine(); return; }
  box.innerHTML=items.map(function(it,idx){
    var state=habitState(it.habitId,selDate);
    return '<div class="rt-row'+(state==='yes'?' done':'')+(state==='no'?' missed':'')+'" data-idx="'+idx+'">'+
      '<span class="rt-grip" onpointerdown="startRtDrag(event,'+idx+')" title="Drag to reorder">\u2630</span>'+
      '<div class="rt-time">'+escH(cleanTime(it.time)||'\u2014')+'</div>'+
      '<div class="rt-hab">'+escH(it.habit)+'</div>'+
      '<div class="rt-acts">'+
        '<button class="rt-mini del" onclick="removeFromRoutine(\''+it.memberId+'\')" title="Remove from this routine">\u00d7</button>'+
        '<div class="yn">'+
          '<button class="yn-b yes'+(state==='yes'?' on':'')+'" onclick="setHabitState(\''+it.habitId+'\',\'yes\')">Yes</button>'+
          '<button class="yn-b no'+(state==='no'?' on':'')+'" onclick="setHabitState(\''+it.habitId+'\',\'no\')">No</button>'+
        '</div>'+
      '</div>'+
      (state==='no' ? reasonRowHTML(it.habitId) : '')+
    '</div>';
  }).join('');
  refreshRoutineCounts();
}

/* Update the numbers around the list without rebuilding the list */
function refreshRoutineCounts(){
  var d=selDate||isoToday();
  var items=itemsFor(activeRoutine);
  var done=doneFor(activeRoutine,d);
  var hit=done.filter(function(x){ return items.some(function(i){ return i.habitId===x; }); }).length;

  var pr=document.getElementById('rt-progress');
  if(pr && items.length){
    var pct=Math.round(hit/items.length*100);
    var dayWord=d===isoToday()?'today':fmtDayLabel(d).replace(/^Today \u00b7 /,'');
    pr.innerHTML='<div class="prog-meta"><span>'+escH(activeRoutine)+' \u00b7 '+escH(dayWord)+'</span>'+
      '<span class="prog-ct">'+hit+'/'+items.length+'</span></div>'+
      '<div class="prog-track"><div class="prog-fill" style="width:'+pct+'%"></div></div>';
  }

  renderCalendar();          // rings only; scroll is gated by the flag
  renderRoutineHistory();
  renderHabitPerf();
  renderHabitPerf();
  if(window.updateSectionBadges) updateSectionBadges();
}

/* ── Routine log writes ──────────────────────────────────
   Each answer used to fire its own request carrying the whole
   day. Those complete out of order, so an earlier write could
   land after a later one and overwrite it — which is how a
   "Yes" or a reason went missing on refresh.

   Writes are now coalesced: rapid taps collapse into a single
   request holding the final state, and only one request per
   (date, routine) is ever in flight. If more answers arrive
   while one is flying, another write follows it rather than
   racing it.
──────────────────────────────────────────────────────── */
var _rlTimer=null, _rlInFlight=false, _rlAgain=false;

function saveRoutineLog(){
  clearTimeout(_rlTimer);
  var el=document.getElementById('rt-sync');
  if(el){ el.textContent='Saving\u2026'; el.className='sync-txt syncing'; }
  _rlTimer=setTimeout(flushRoutineLog,450);
}

async function flushRoutineLog(){
  if(_rlInFlight){ _rlAgain=true; return; }   // queue, never race
  _rlInFlight=true;

  var d=selDate||isoToday();
  var rt=activeRoutine;
  var p=d.split('-'), dd=new Date(+p[0],+p[1]-1,+p[2]);
  var mm=missFor(rt,d);
  var missStr=Object.keys(mm).map(function(k){ return k+'~~'+(mm[k]||''); }).join('||');

  var ok=await postToSheet({sheet:'RoutineLog',
    date:dd.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}),
    dateISO:d, routine:rt,
    done:doneFor(rt,d).join(','), missed:missStr});

  _rlInFlight=false;
  DIAG.rtSync = ok?'OK':'FAILED';

  var el=document.getElementById('rt-sync');
  if(el){ el.textContent=ok?'Saved to Sheet \u2713':'Sheet sync failed \u2014 tap a habit to retry';
          el.className='sync-txt '+(ok?'ok':'err'); }

  if(_rlAgain){ _rlAgain=false; flushRoutineLog(); }   // newer state pending
}

/* Don't let a pending write die with the page */
window.addEventListener('beforeunload',function(){
  if(_rlTimer){ clearTimeout(_rlTimer); flushRoutineLog(); }
});

function untickRoutine(){
  var d=selDate||isoToday();
  if(!doneFor(activeRoutine,d).length) return;
  var when=d===isoToday()?'today':fmtDayLabel(d).replace(/^Today \u00b7 /,'');
  if(!confirm('Untick every habit in '+activeRoutine+' for '+when+'?')) return;
  if(routineLog[d]) routineLog[d][activeRoutine]=[];
  renderRoutine(); saveRoutineLog();
}

/* Each day scored against the habits present ON THAT DAY */
/* ── Per-habit completion ────────────────────────────────
   Counts the days a habit was actually SCHEDULED — the day ran
   this routine, the habit had joined by then and had not yet
   left — and how many of those it was marked Yes on. Days before
   a habit joined never enter its denominator.
──────────────────────────────────────────────────────── */
function habitStats(habitId, windowDays){
  var today=isoToday(), sched=0, done=0, first='';
  var span = windowDays || 400;
  for(var i=0;i<span;i++){
    var d=new Date(); d.setDate(d.getDate()-i);
    var iso=isoDate(d);
    if(iso>today) continue;
    if(routineForDate(iso)!==activeRoutine) continue;
    var inRoutine=itemsOn(activeRoutine,iso).some(function(x){ return x.habitId===habitId; });
    if(!inRoutine) continue;
    sched++;
    if(!first||iso<first) first=iso;
    if(doneFor(activeRoutine,iso).indexOf(habitId)>-1) done++;
  }
  return {sched:sched, done:done, pct: sched?Math.round(done/sched*100):null, since:first};
}

function hpColor(pct){
  if(pct===null) return 'var(--text-3)';
  if(pct>=80) return 'var(--green)';
  if(pct>=50) return 'var(--teal)';
  if(pct>=25) return 'var(--gold)';
  return 'var(--rose)';
}

function renderHabitPerf(){
  var el=document.getElementById('hp-list'); if(!el) return;
  var rn=document.getElementById('hp-routine');
  if(rn) rn.textContent=activeRoutine||'';

  var items=itemsOn(activeRoutine,isoToday());
  var noteEl=document.getElementById('hp-note');

  if(!items.length){
    el.innerHTML='<div class="rt-empty">No habits in '+escH(activeRoutine||'this routine')+' today.</div>';
    if(noteEl) noteEl.textContent='';
    return;
  }

  var rows=items.map(function(it){
    return {it:it, w:habitStats(it.habitId,7), a:habitStats(it.habitId)};
  });
  // Weakest over 7 days first — what needs attention surfaces at the top
  rows.sort(function(x,y){
    var a=x.w.pct===null?101:x.w.pct, b=y.w.pct===null?101:y.w.pct;
    if(a!==b) return a-b;
    return timeToMin(x.it.time)-timeToMin(y.it.time);
  });

  function cell(s){
    if(s.pct===null) return '<div class="hp-cell"><div class="hp-none">\u2013</div></div>';
    return '<div class="hp-cell">'+
      '<div class="hp-pct" style="color:'+hpColor(s.pct)+'">'+s.pct+'%</div>'+
      '<div class="hp-frac">'+s.done+'/'+s.sched+'</div></div>';
  }

  el.innerHTML=rows.map(function(r){
    var pct=r.a.pct===null?0:r.a.pct;
    return '<div class="hp-row">'+
      '<div class="hp-name">'+
        (r.it.time?'<div class="hp-t">'+escH(cleanTime(r.it.time))+'</div>':'')+
        '<div class="hp-h">'+escH(r.it.habit)+'</div>'+
        '<div class="hp-bar"><div class="hp-fill" style="width:'+pct+'%;background:'+hpColor(r.a.pct)+'"></div></div>'+
      '</div>'+
      cell(r.w)+cell(r.a)+
    '</div>';
  }).join('');

  var totD=0, totS=0;
  rows.forEach(function(r){ totD+=r.a.done; totS+=r.a.sched; });
  var worst=rows.filter(function(r){ return r.a.pct!==null; })[0];
  if(noteEl){
    noteEl.innerHTML = totS
      ? 'Across all habits: <strong style="color:var(--text-1)">'+Math.round(totD/totS*100)+'%</strong> ('+totD+'/'+totS+' scheduled). '+
        (worst&&worst.a.pct<60 ? 'Weakest right now: <strong style="color:var(--text-1)">'+escH(worst.it.habit)+'</strong>.' : '')
      : 'Nothing scheduled yet \u2014 stats appear once this routine has run for a day.';
  }

  var badge=document.getElementById('badge-habitperf');
  if(badge && totS){ badge.textContent=Math.round(totD/totS*100)+'%'; badge.style.display=''; }
}

function renderRoutineHistory(){
  var statsEl=document.getElementById('rt-stats');
  if(!statsEl) return;

  // 14-day rolling figures, each day scored against the habits
  // that were actually in the routine on that day
  var sum=0, fullDays=0, counted=0;
  for(var i=13;i>=0;i--){
    var dd=new Date(); dd.setDate(dd.getDate()-i);
    var iso=isoDate(dd);
    if(routineForDate(iso)!==activeRoutine) continue;
    var items=itemsOn(activeRoutine,iso);
    if(!items.length) continue;
    var ids=items.map(function(x){ return x.habitId; });
    var hit=doneFor(activeRoutine,iso).filter(function(x){ return ids.indexOf(x)>-1; }).length;
    sum+=Math.round(hit/items.length*100); counted++;
    if(hit===items.length) fullDays++;
  }

  var streak=0;
  for(var k=0;k<365;k++){
    var d2=new Date(); d2.setDate(d2.getDate()-k);
    var iso2=isoDate(d2);
    if(routineForDate(iso2)!==activeRoutine) continue;
    var it2=itemsOn(activeRoutine,iso2);
    if(!it2.length) continue;
    var ids2=it2.map(function(x){ return x.habitId; });
    var dn=doneFor(activeRoutine,iso2).filter(function(x){ return ids2.indexOf(x)>-1; });
    if(dn.length===it2.length) streak++;
    else if(k>0) break;
  }

  statsEl.innerHTML=
    '<div class="rt-stat"><div class="rt-stat-n" style="color:var(--green)">'+streak+'</div><div class="rt-stat-l">\ud83d\udd25 Day streak</div></div>'+
    '<div class="rt-stat"><div class="rt-stat-n">'+(counted?Math.round(sum/counted):0)+'%</div><div class="rt-stat-l">14-day average</div></div>'+
    '<div class="rt-stat"><div class="rt-stat-n" style="color:var(--teal)">'+fullDays+'</div><div class="rt-stat-l">Full days</div></div>';
}

/* ── Drag to reorder ────────────────────────────────────── */
var _rtDrag=null;

function startRtDrag(ev,idx){
  ev.preventDefault();
  var row=ev.target.closest('.rt-row'); if(!row) return;
  _rtDrag={from:idx,to:idx,moved:false};
  row.classList.add('dragging');
  try{ ev.target.setPointerCapture(ev.pointerId); }catch(e){}
  document.addEventListener('pointermove',onRtDragMove);
  document.addEventListener('pointerup',endRtDrag);
  document.addEventListener('pointercancel',endRtDrag);
}

function onRtDragMove(ev){
  if(!_rtDrag) return;
  var box=document.getElementById('rt-items'); if(!box) return;
  var rows=Array.prototype.slice.call(box.querySelectorAll('.rt-row'));
  rows.forEach(function(r){ r.classList.remove('drag-over','drag-over-below'); });
  var target=null, below=false;
  for(var i=0;i<rows.length;i++){
    var b=rows[i].getBoundingClientRect();
    if(ev.clientY>=b.top&&ev.clientY<=b.bottom){ target=i; below=ev.clientY>b.top+b.height/2; break; }
    if(i===rows.length-1&&ev.clientY>b.bottom){ target=i; below=true; }
    if(i===0&&ev.clientY<b.top){ target=0; below=false; }
  }
  if(target===null) return;
  var dest=below?target+1:target;
  if(dest>_rtDrag.from) dest--;
  dest=Math.max(0,Math.min(itemsFor(activeRoutine).length-1,dest));
  _rtDrag.to=dest; _rtDrag.moved=true;
  if(rows[target]&&target!==_rtDrag.from) rows[target].classList.add(below?'drag-over-below':'drag-over');
}

function endRtDrag(){
  document.removeEventListener('pointermove',onRtDragMove);
  document.removeEventListener('pointerup',endRtDrag);
  document.removeEventListener('pointercancel',endRtDrag);
  if(!_rtDrag) return;
  var d=_rtDrag; _rtDrag=null;
  var box=document.getElementById('rt-items');
  if(box) box.querySelectorAll('.rt-row').forEach(function(r){
    r.classList.remove('dragging','drag-over','drag-over-below'); });
  if(!d.moved||d.to===d.from){ renderRoutine(); return; }
  var list=itemsFor(activeRoutine);
  var moved=list.splice(d.from,1)[0];
  list.splice(d.to,0,moved);
  list.forEach(function(it,i){
    var m=routineItems.find(function(x){ return x.sheetId===it.memberId; });
    if(m) m.order=i;
  });
  renderRoutine();
  rtSync(postToSheet({sheet:'RoutineItems',action:'reorder',
    order:list.map(function(i){ return i.memberId; }).join(',')}))
    .then(function(ok){ if(ok) showToast('Order updated \u2713','success'); });
}

function rtSync(promise){
  var el=document.getElementById('rt-sync');
  if(el){ el.textContent='Syncing\u2026'; el.className='sync-txt syncing'; }
  return promise.then(function(ok){
    DIAG.rtSync=ok?'OK':'FAILED';
    if(el){ el.textContent=ok?'Saved to Sheet \u2713':'Sheet sync failed'; el.className='sync-txt '+(ok?'ok':'err'); }
    return ok;
  });
}

/* ── Sheet loaders ──────────────────────────────────────── */
function replaceHabitMasterFromSheet(rows){
  habitMaster=rows.map(function(r){
    return {sheetId:r.sheetId||'',time:cleanTime(r.time||''),habit:r.habit||''};
  });
  renderMaster(); renderRoutine();
}

function replaceRoutineItemsFromSheet(rows){
  routineItems=rows.map(function(r){
    return {sheetId:r.sheetId||'',routine:r.routine||'',habitId:r.habitId||'',
      order:(r.order===null||r.order===undefined)?9999:Number(r.order),
      addedOn:r.addedOn||'',removedOn:r.removedOn||''};
  });
  renderRoutine();
}

function replaceRoutineDayFromSheet(rows){
  routineDay={};
  rows.forEach(function(r){ if(r.dateISO&&r.routine) routineDay[r.dateISO]=r.routine; });
  if(!selDate) selDate=isoToday();
  activeRoutine=routineForDate(selDate);
  _calNeedsScroll=true;
  renderRoutine();
}

function replaceRoutineLogFromSheet(rows){
  routineLog={}; routineMiss={};
  rows.forEach(function(r){
    if(!r.dateISO||!r.routine) return;

    var yes=String(r.done||'').split(',').map(function(s){ return s.trim(); }).filter(Boolean);
    var m={};
    String(r.missed||'').split('||').forEach(function(pair){
      if(!pair.trim()) return;
      var bits=pair.split('~~');
      if(bits[0]&&bits[0].trim()) m[bits[0].trim()]=(bits[1]||'').trim();
    });

    if(!routineLog[r.dateISO])  routineLog[r.dateISO]={};
    if(!routineMiss[r.dateISO]) routineMiss[r.dateISO]={};

    /* If the sheet holds more than one row for this day+routine
       (older versions could create duplicates), take the richer
       one rather than letting the last row blindly win — that is
       how answered habits disappeared on reload. */
    var prevYes=routineLog[r.dateISO][r.routine];
    var prevMiss=routineMiss[r.dateISO][r.routine];
    if(prevYes || prevMiss){
      var prevCount=(prevYes?prevYes.length:0)+(prevMiss?Object.keys(prevMiss).length:0);
      var newCount=yes.length+Object.keys(m).length;
      if(newCount<prevCount) return;   // keep the fuller record
    }

    routineLog[r.dateISO][r.routine]=yes;
    routineMiss[r.dateISO][r.routine]=m;
  });
}

function replaceHabitReasonsFromSheet(rows){
  habitReasons=rows.map(function(r){
    return {sheetId:r.sheetId||'',habitId:r.habitId||'',reason:r.reason||''};
  });
  renderRoutineRows();
}

async function fetchAllRoutines(){
  var d=await sheetFetch(WORKER_URL+'?action=getAllRoutineItems');
  if(d&&d.status==='ok'&&Array.isArray(d.routineItems)) replaceRoutineItemsFromSheet(d.routineItems);
}

/* Show the back-to-top control once the page is genuinely long */
window.addEventListener('scroll',function(){
  var b=document.getElementById('totop');
  if(b) b.classList.toggle('on', window.scrollY>600);
},{passive:true});

/* START */
init();
setInterval(function(){document.getElementById('time-now').textContent=new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true});},60000);


/* ═══════════════════════════════════════════════════
   TAB BADGES — a count on every tab, like Thoughts and Posts.
   List tabs show their total. Morning shows your rules; Routine shows
   what's still left to do today (0 when everything is done).
   Recounted whenever one of these sections redraws.
═══════════════════════════════════════════════════ */
function updateAllBadges(){
  try{
    setBadge('mor-badge',dailyRules.length);
    setBadge('mot-badge',motEntries.length);
    setBadge('grat-badge',gratEntries.length);
    setBadge('kun-badge',kunEntries.length);
    setBadge('gd-badge',guide.length);
    var today=isoToday(), rname=routineForDate(today), left=0;
    if(rname){
      var items=itemsOn(rname,today), done=doneFor(rname,today);
      left=items.filter(function(i){ return done.indexOf(i.habitId)===-1; }).length;
    }
    setBadge('rt-badge',left);
  }catch(e){ console.warn('[badges]',e); }
}
['renderMotivation','renderGratitude','renderKundali','renderGuide','renderDailyRules','renderRoutineRows','renderGlance']
  .forEach(function(n){
    var f=window[n]; if(typeof f!=='function') return;
    window[n]=function(){ var r=f.apply(this,arguments); updateAllBadges(); return r; };
  });


/* Keep the check-in and weekly review in step with what they read */
(function(){
  function after(n,fn){ var f=window[n]; if(typeof f!=='function') return; window[n]=function(){ var r=f.apply(this,arguments); try{ fn(); }catch(e){ console.warn(e); } return r; }; }
  after('renderDailyRules',function(){ renderCheckin(); });
  after('renderGlance',function(){ renderWeekly(); });
  after('replaceSituationsFromSheet',function(){ renderWeekly(); });
  after('replaceGuideFromSheet',function(){ renderSitMatch(); });
  document.addEventListener('keydown',function(e){ if(e.key==='Escape'){ var m=document.getElementById('set-modal'); if(m&&!m.hidden) closeSettings(); } });
})();
