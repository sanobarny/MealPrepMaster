// @ts-nocheck
'use client'

import { useState, useEffect, useRef, useMemo, Component } from "react";
import { createClient } from '@supabase/supabase-js';

// ─── ERROR BOUNDARY ───────────────────────────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = {error:null}; }
  static getDerivedStateFromError(e) { return {error:e}; }
  componentDidCatch(e, info) { console.error('App crashed:', e, info); }
  render() {
    if (this.state.error) return (
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'100vh',padding:32,fontFamily:'sans-serif',textAlign:'center',background:'#fff'}}>
        <div style={{fontSize:48,marginBottom:16}}>⚠️</div>
        <h2 style={{margin:'0 0 8px',fontSize:20}}>Something went wrong</h2>
        <p style={{color:'#666',fontSize:14,marginBottom:8,maxWidth:340}}>{String(this.state.error?.message||'Unknown error')}</p>
        <p style={{color:'#999',fontSize:12,marginBottom:24}}>Your data is safe. Tap below to reload.</p>
        <button onClick={()=>{this.setState({error:null});window.location.reload();}}
          style={{background:'#3a7d5e',color:'#fff',border:'none',borderRadius:10,padding:'12px 28px',fontSize:15,cursor:'pointer',fontFamily:'inherit',fontWeight:700}}>
          Reload App
        </button>
      </div>
    );
    return this.props.children;
  }
}

// ─── SAFE STORAGE ─────────────────────────────────────────────────────────────
// localStorage.setItem throws QuotaExceededError on iOS when full — never let it crash the app
const lsSave = (key, val) => {
  try { localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val)); }
  catch(e) { console.warn('localStorage full, could not save', key, e); }
};

// Validate and fill in any missing fields on a profile loaded from storage/cloud
const sanitizeProfile = p => ({
  id: p?.id || ('p_'+Date.now()),
  name: p?.name || 'Me',
  macroGoals: p?.macroGoals && typeof p.macroGoals === 'object'
    ? {calories:p.macroGoals.calories||2000, protein:p.macroGoals.protein||50, carbs:p.macroGoals.carbs||130, fat:p.macroGoals.fat||65}
    : {calories:2000,protein:50,carbs:130,fat:65},
  cookLog: Array.isArray(p?.cookLog) ? p.cookLog : [],
  supplements: Array.isArray(p?.supplements) ? p.supplements : [],
});

const SUPABASE_URL = 'https://aznxerdepisjfsaatzyg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6bnhlcmRlcGlzamZzYWF0enlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1Njc5NjUsImV4cCI6MjA5MTE0Mzk2NX0.Bx9Rtywb9OOk3b6U_skK5IQz5EHZwK1vIsw4geW5sEs';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const SAMPLE_RECIPES = [
  {
    id:1, title:"Veggie Omelette", category:"breakfast", image:null,
    tags:["PCOS-Friendly","Gluten-Free","Low Carb","Blood Sugar Stable"], allergens:["eggs","dairy"],
    equipment:["stove"], type:{protein:true,grain:false,side:false},
    nutrition:{calories:280,protein:18,carbs:6,fat:20}, goal:["lose weight"],
    ingredients:[{name:"Eggs",amount:3,unit:"pcs"},{name:"Spinach",amount:1,unit:"cup"},{name:"Cherry Tomatoes",amount:0.5,unit:"cup"},{name:"Olive Oil",amount:1,unit:"tbsp"},{name:"Feta Cheese",amount:2,unit:"tbsp"}],
    steps:[{text:"Halve tomatoes and wash spinach.",timeMin:3,imagePrompt:"overhead studio shot of halved cherry tomatoes and fresh spinach on wood cutting board, white marble, soft studio lighting"},{text:"Crack 3 eggs into bowl, whisk until uniform.",timeMin:2,imagePrompt:"overhead studio shot of three cracked eggs being whisked in white ceramic bowl, white marble, soft studio lighting"},{text:"Heat oil in pan until shimmering.",timeMin:2,imagePrompt:"overhead studio shot of olive oil shimmering in dark non-stick skillet, white marble, soft studio lighting"},{text:"Pour eggs, add veg, cook 3 min then fold.",timeMin:4,imagePrompt:"overhead studio shot of golden omelette folding in non-stick pan with spinach and tomatoes, white marble, soft studio lighting"}],
    sourceUrl:"", prepTime:5, cookTime:6, totalTime:11, servings:1, difficulty:"beginner",
    healthBenefits:"Protein-rich and blood-sugar friendly.", bloodSugarFriendly:true
  },
  {
    id:2, title:"Grilled Chicken Quinoa Bowl", category:"lunch", image:null,
    tags:["High Protein","Dairy-Free","PCOS-Friendly","Anti-Inflammatory"], allergens:[],
    equipment:["oven","stove"], type:{protein:true,grain:true,side:false},
    nutrition:{calories:420,protein:35,carbs:40,fat:15}, goal:["gain muscle","lose weight"],
    ingredients:[{name:"Chicken Breast",amount:1.5,unit:"lbs"},{name:"Quinoa",amount:2,unit:"cups"},{name:"Broccoli",amount:4,unit:"cups"},{name:"Olive Oil",amount:0.25,unit:"cup"},{name:"Garlic",amount:4,unit:"cloves"}],
    steps:[{text:"Season chicken with garlic, olive oil and herbs.",timeMin:5,imagePrompt:"overhead studio shot of raw chicken breasts being seasoned with garlic and herbs, white marble, soft studio lighting"},{text:"Rinse quinoa, simmer in 4 cups water 15 min.",timeMin:18,imagePrompt:"overhead studio shot of quinoa simmering in white ceramic pot, white marble, soft studio lighting"},{text:"Grill chicken 6-7 min per side until 165F.",timeMin:14,imagePrompt:"overhead studio shot of chicken with grill marks in cast iron pan, white marble, soft studio lighting"},{text:"Steam broccoli 4-5 min until bright green.",timeMin:5,imagePrompt:"overhead studio shot of bright green broccoli florets in steamer basket, white marble, soft studio lighting"}],
    sourceUrl:"", prepTime:10, cookTime:37, totalTime:47, servings:4, difficulty:"intermediate",
    healthBenefits:"High protein and anti-inflammatory omega-3s.", antiInflammatory:true
  },
  {
    id:3, title:"Matcha Oat Latte", category:"drink", image:null,
    tags:["Dairy-Free","PCOS-Friendly","Low Calorie"], allergens:[],
    equipment:["none"], type:{protein:false,grain:false,side:false},
    nutrition:{calories:90,protein:2,carbs:14,fat:3}, goal:["lose weight","maintenance"],
    ingredients:[{name:"Matcha Powder",amount:1,unit:"tsp"},{name:"Oat Milk",amount:1,unit:"cup"},{name:"Honey",amount:1,unit:"tsp"},{name:"Hot Water",amount:0.25,unit:"cup"}],
    steps:[{text:"Sift matcha into ceramic bowl.",timeMin:1,imagePrompt:"overhead studio shot of bright green matcha being sifted into white ceramic bowl, white marble, soft studio lighting"},{text:"Add 175F water, whisk in W motion until frothy.",timeMin:2,imagePrompt:"overhead studio shot of matcha being whisked with bamboo whisk in white bowl, white marble, soft studio lighting"},{text:"Warm oat milk, froth, pour over matcha.",timeMin:3,imagePrompt:"overhead studio shot of frothed oat milk being poured over matcha in clear glass, white marble, soft studio lighting"}],
    sourceUrl:"", prepTime:2, cookTime:4, totalTime:6, servings:1, difficulty:"beginner", healthBenefits:""
  },
  {
    id:4, title:"Dark Chocolate Coconut Mousse", category:"dessert", image:null,
    tags:["Dairy-Free","Gluten-Free","Vegan"], allergens:[],
    equipment:["none"], type:{protein:false,grain:false,side:true},
    nutrition:{calories:210,protein:4,carbs:28,fat:12}, goal:["maintenance"],
    ingredients:[{name:"Dark Chocolate 70%",amount:200,unit:"g"},{name:"Coconut Cream",amount:1,unit:"cup"},{name:"Maple Syrup",amount:3,unit:"tbsp"},{name:"Vanilla Extract",amount:1,unit:"tsp"}],
    steps:[{text:"Melt chocolate over double boiler.",timeMin:6,imagePrompt:"overhead studio shot of dark chocolate melting in glass bowl over saucepan, white marble, soft studio lighting"},{text:"Whip chilled coconut cream to stiff peaks.",timeMin:4,imagePrompt:"overhead studio shot of white coconut cream being whipped in white bowl, white marble, soft studio lighting"},{text:"Fold chocolate into cream, chill 2 hrs.",timeMin:5,imagePrompt:"overhead studio shot of chocolate being folded into coconut cream with spatula, white marble, soft studio lighting"}],
    sourceUrl:"", prepTime:15, cookTime:11, totalTime:26, servings:4, difficulty:"intermediate", healthBenefits:""
  },
  {
    id:5, title:"Turmeric Ginger Salmon Bowl", category:"lunch", image:null,
    tags:["Anti-Inflammatory","Omega-3 Rich","Gluten-Free","Dairy-Free","High Protein","Blood Sugar Stable"], allergens:["shellfish"],
    equipment:["stove","oven"], type:{protein:true,grain:true,side:false},
    nutrition:{calories:480,protein:42,carbs:38,fat:18}, goal:["lose weight","maintenance"],
    ingredients:[{name:"Salmon Fillet",amount:2,unit:"pcs"},{name:"Brown Rice",amount:1,unit:"cup"},{name:"Turmeric",amount:1,unit:"tsp"},{name:"Fresh Ginger",amount:1,unit:"tbsp"},{name:"Spinach",amount:2,unit:"cups"},{name:"Olive Oil",amount:2,unit:"tbsp"}],
    steps:[{text:"Cook brown rice with pinch of turmeric 35 min.",timeMin:35,imagePrompt:"overhead studio shot of brown rice simmering with golden turmeric in white pot, white marble, soft studio lighting"},{text:"Rub salmon with turmeric, ginger and olive oil.",timeMin:5,imagePrompt:"overhead studio shot of salmon being rubbed with golden turmeric on white marble, soft studio lighting"},{text:"Sear salmon 4 min per side until golden.",timeMin:8,imagePrompt:"overhead studio shot of golden seared salmon in cast iron pan, white marble, soft studio lighting"},{text:"Wilt spinach in same pan with garlic 2 min.",timeMin:3,imagePrompt:"overhead studio shot of bright green spinach wilting in cast iron pan, white marble, soft studio lighting"}],
    sourceUrl:"", prepTime:10, cookTime:46, totalTime:56, servings:2, difficulty:"intermediate",
    healthBenefits:"Rich in omega-3s and curcumin — potent anti-inflammatory compounds.", antiInflammatory:true, bloodSugarFriendly:true
  },
  {
    id:6, title:"Blood Sugar Balance Bowl", category:"breakfast", image:null,
    tags:["Blood Sugar Stable","Anti-Inflammatory","Vegan","Gluten-Free","High Fiber","PCOS-Friendly"], allergens:["nuts"],
    equipment:["none"], type:{protein:false,grain:true,side:false},
    nutrition:{calories:340,protein:12,carbs:48,fat:14}, goal:["lose weight","maintenance"],
    ingredients:[{name:"Steel-Cut Oats",amount:0.5,unit:"cup"},{name:"Chia Seeds",amount:2,unit:"tbsp"},{name:"Blueberries",amount:0.5,unit:"cup"},{name:"Cinnamon",amount:0.5,unit:"tsp"},{name:"Almond Butter",amount:1,unit:"tbsp"},{name:"Almond Milk",amount:1,unit:"cup"}],
    steps:[{text:"Mix oats, chia, almond milk and cinnamon.",timeMin:3,imagePrompt:"overhead studio shot of oats, chia seeds and cinnamon in white bowl with almond milk, white marble, soft studio lighting"},{text:"Refrigerate overnight or simmer 20 min.",timeMin:1,imagePrompt:"overhead studio shot of covered white bowl with overnight oats, white marble, soft studio lighting"},{text:"Top with blueberries and almond butter drizzle.",timeMin:2,imagePrompt:"overhead studio shot of oat bowl topped with blueberries and almond butter, white marble, soft studio lighting"}],
    sourceUrl:"", prepTime:5, cookTime:1, totalTime:6, servings:1, difficulty:"beginner",
    healthBenefits:"Steel-cut oats and chia create a slow-digesting blood-sugar-stabilising breakfast.", antiInflammatory:true, bloodSugarFriendly:true
  }
];

const CATEGORIES = [
  {id:"all",label:"All Recipes",icon:"\u{1F37D}\uFE0F"},
  {id:"breakfast",label:"Breakfast",icon:"\u{1F305}"},
  {id:"lunch",label:"Lunch",icon:"\u{1F957}"},
  {id:"dessert",label:"Desserts",icon:"\u{1F36B}"},
  {id:"drink",label:"Drinks",icon:"\u{1F375}"},
];
const DIET_TAGS = ["PCOS-Friendly","High Protein","Gluten-Free","Dairy-Free","Vegan","Low Carb","High Fiber","Low Calorie"];
const HEALTH_TAGS = ["Anti-Inflammatory","Blood Sugar Stable","Omega-3 Rich","Antioxidant","Gut Health","Heart Healthy"];
const ALL_TAGS = [...DIET_TAGS,...HEALTH_TAGS];
const EQUIPMENT_LIST = ["stove","oven","air fryer","rice cooker","blender","none"];
const ALLERGENS_LIST = ["gluten","dairy","eggs","nuts","soy","shellfish"];
const GOALS = ["lose weight","gain muscle","maintenance"];
const DIFFICULTIES = {beginner:{label:"Beginner",color:"#5aad8e",icon:"\u{1F331}"},intermediate:{label:"Intermediate",color:"#d4875a",icon:"\u{1F373}"},advanced:{label:"Advanced",color:"#c06090",icon:"\u{1F468}\u200D\u{1F373}"}};
const TAG_COLORS = {"PCOS-Friendly":"#c06090","High Protein":"#3a7d5e","Dairy-Free":"#d4875a","Gluten-Free":"#5a8fd4","Vegan":"#6db85a","Low Carb":"#b8a23e","High Fiber":"#7b6cd4","Low Calorie":"#3eabb8"};
const HEALTH_COLORS = {"Anti-Inflammatory":"#e07a40","Blood Sugar Stable":"#5aad8e","Omega-3 Rich":"#5a8fd4","Antioxidant":"#9b5aad","Gut Health":"#ad8e5a","Heart Healthy":"#e05a6a"};
const ALL_TAG_COLORS = {...TAG_COLORS,...HEALTH_COLORS};
const STEP_COLORS = ["#3a7d5e","#5a8fd4","#d4875a","#c06090","#6db85a","#b8a23e","#7b6cd4","#3eabb8"];
const SPICE_LABELS = ["No Spice","Mild","Medium","Hot","Very Hot","Extreme 🔥"];
const CUISINES = ["Italian","Mediterranean","Asian","Mexican","American","Middle Eastern","Indian","Japanese","Thai","Greek","French","Moroccan","Other"];
const CUISINE_COLORS = {"Italian":"#e05a6a","Mediterranean":"#5a8fd4","Asian":"#d4875a","Mexican":"#6db85a","American":"#b8a23e","Middle Eastern":"#c06090","Indian":"#e07a40","Japanese":"#9b5aad","Thai":"#3eabb8","Greek":"#5aad8e","French":"#c8a8ff","Moroccan":"#ad8e5a","Other":"#8a9bb0"};

const FOOD_EMOJIS = [
  [/blueberr/,"🫐"],[/strawberr/,"🍓"],[/raspberr/,"🍓"],[/cherry/,"🍒"],
  [/mango/,"🥭"],[/pineapple/,"🍍"],[/coconut cream|coconut milk/,"🥥"],[/coconut/,"🥥"],
  [/corn/,"🌽"],[/avocado/,"🥑"],[/sweet potato/,"🍠"],[/eggplant|aubergine/,"🍆"],
  [/tomato/,"🍅"],[/carrot/,"🥕"],[/broccoli/,"🥦"],[/onion|shallot/,"🧅"],[/garlic/,"🧄"],
  [/mushroom/,"🍄"],[/zucchini|courgette/,"🥒"],[/cucumber/,"🥒"],[/bell pepper|capsicum/,"🫑"],
  [/chili|chilli|jalapen/,"🌶️"],[/lemon|lime/,"🍋"],[/orange/,"🍊"],[/apple/,"🍎"],[/banana/,"🍌"],
  [/lettuce|kale|spinach|chard|arugula/,"🥬"],[/basil|cilantro|parsley|mint|dill|herb/,"🌿"],
  [/ginger/,"🫚"],[/celery/,"🥬"],[/asparagus/,"🥦"],[/potato/,"🥔"],
  [/chicken/,"🍗"],[/beef|steak|mince|ground beef/,"🥩"],[/bacon|ham/,"🥓"],[/pork/,"🥩"],
  [/lamb/,"🍖"],[/turkey/,"🦃"],[/salmon|tuna|fish|cod|tilapia|halibut/,"🐟"],[/shrimp|prawn/,"🍤"],
  [/egg/,"🥚"],[/tofu|tempeh/,"🫘"],
  [/milk/,"🥛"],[/cheese|cheddar|mozzarella|feta|parmesan|ricotta/,"🧀"],[/yogurt/,"🥛"],[/butter/,"🧈"],[/cream/,"🥛"],
  [/rice/,"🍚"],[/oat/,"🥣"],[/quinoa/,"🌾"],[/pasta|spaghetti|penne|fettuccine/,"🍝"],
  [/noodle|ramen/,"🍜"],[/bread/,"🍞"],[/tortilla|wrap|pita/,"🫓"],[/flour/,"🌾"],
  [/oil/,"🫙"],[/honey/,"🍯"],[/sugar/,"🍬"],[/chocolate/,"🍫"],[/maple/,"🍁"],
  [/almond|walnut|cashew|pecan|pistachio/,"🥜"],[/peanut/,"🥜"],[/\bnut\b/,"🥜"],
  [/chia|flax|sesame|sunflower seed/,"🌱"],[/seed/,"🌱"],[/vanilla/,"🌸"],
  [/cinnamon|turmeric|paprika|cumin|oregano|thyme|rosemary/,"🌿"],[/salt/,"🧂"],
  [/water/,"💧"],[/broth|stock/,"🫙"],[/soy sauce|sauce|vinegar/,"🫙"],
  [/lentil|bean|chickpea|legume/,"🫘"],[/matcha|green tea/,"🍵"],[/coffee/,"☕"],
  [/juice/,"🧃"],[/avocado/,"🥑"],
];
const getItemEmoji = name => {
  const n = (name||"").toLowerCase();
  return (FOOD_EMOJIS.find(([rx]) => rx.test(n)) || [,"🛒"])[1];
};
// Returns all images for a step — supports both legacy step.image and new step.images[]
const getStepImages = step => {
  if (step.images && step.images.length > 0) return step.images;
  return step.image ? [step.image] : [];
};

// ─── BUDGET / COST ESTIMATION ─────────────────────────────────────────────────
const INGREDIENT_COSTS = {meat:8, dairy:4, produce:2.5, grains:3, other:2};
const ingredientCat = n => {
  n = (n||"").toLowerCase();
  if (/chicken|beef|salmon|tuna|fish|shrimp|egg|turkey|pork|lamb/.test(n)) return 'meat';
  if (/milk|cheese|yogurt|butter|cream|feta|parmesan|ricotta/.test(n)) return 'dairy';
  if (/onion|garlic|tomato|pepper|spinach|carrot|celery|broccoli|mushroom|zucchini|avocado|lemon|lime|berry|apple|banana|herb|basil|cilantro|parsley|ginger|lettuce|kale/.test(n)) return 'produce';
  if (/rice|oat|quinoa|pasta|flour|bread|noodle|oil|sauce|vinegar|soy|salt|spice|cumin|paprika|sugar|honey|nut|almond|seed|tortilla/.test(n)) return 'grains';
  return 'other';
};
// Returns estimated cost per serving (USD)
const recipeEstCost = r => {
  const total = (r.ingredients||[]).reduce((s, ing) => {
    const mult = Math.min(2, Math.max(0.25, (ing.amount||1) / 4));
    return s + INGREDIENT_COSTS[ingredientCat(ing.name)] * mult;
  }, 0);
  return Math.round(total / Math.max(r.servings||1, 1) * 10) / 10;
};

// ─── PWA STORAGE ──────────────────────────────────────────────────────────────
// iOS "Add to Home Screen" gives the standalone app its OWN localStorage,
// completely separate from Safari's. Cookies are shared across all contexts.
// So we write small keys (API keys, auth session) to BOTH localStorage AND
// cookies so they survive no matter how the app was opened.
const pwaGet = key => {
  if (typeof window === 'undefined') return null;
  try { const v = localStorage.getItem(key); if (v) return v; } catch(e) {}
  try {
    const m = document.cookie.match('(?:^|; )mpm_' + key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '=([^;]*)');
    return m ? decodeURIComponent(m[1]) : null;
  } catch(e) { return null; }
};
const pwaSet = (key, value) => {
  if (typeof window === 'undefined') return;
  try {
    if (value != null) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch(e) {}
  try {
    if (value != null) {
      // Only cookie-store values small enough to fit (< 3500 encoded chars)
      const enc = encodeURIComponent(value);
      if (enc.length < 3500)
        document.cookie = 'mpm_' + key + '=' + enc + ';max-age=31536000;path=/;SameSite=Lax';
    } else {
      document.cookie = 'mpm_' + key + '=;max-age=0;path=/';
    }
  } catch(e) {}
};
// Custom storage adapter for Supabase — mirrors to cookies for PWA persistence
const supaStorage = typeof window !== 'undefined' ? {
  getItem: key => {
    try { const v = localStorage.getItem(key); if (v) return v; } catch(e) {}
    try {
      const ck = 'mpm_sb_' + key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const m = document.cookie.match('(?:^|; )' + ck + '=([^;]*)');
      return m ? decodeURIComponent(m[1]) : null;
    } catch(e) { return null; }
  },
  setItem: (key, value) => {
    try { localStorage.setItem(key, value); } catch(e) {}
    try {
      const enc = encodeURIComponent(value || '');
      if (enc.length < 3500)
        document.cookie = 'mpm_sb_' + key + '=' + enc + ';max-age=31536000;path=/;SameSite=Lax';
    } catch(e) {}
  },
  removeItem: key => {
    try { localStorage.removeItem(key); } catch(e) {}
    try { document.cookie = 'mpm_sb_' + key + '=;max-age=0;path=/'; } catch(e) {}
  }
} : undefined;

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const scaleAmt = (n, r) => {
  const v = Math.round(n * r * 10) / 10;
  return v % 1 === 0 ? v : v.toFixed(1);
};

// ─── ANTHROPIC API HELPER ────────────────────────────────────────────────────
let _lastCallTime = 0;
const MIN_GAP_MS = 3000; // 3 s between calls → max 20 req/min, well under limits

async function anthropicCall(body, retries = 3) {
  const key = pwaGet('anthropic_key');
  if (!key) throw new Error("NO_KEY");

  // Throttle: enforce minimum gap between calls
  const now = Date.now();
  const wait = Math.max(0, _lastCallTime + MIN_GAP_MS - now);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  _lastCallTime = Date.now();

  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({ model: "claude-sonnet-4-6", ...body })
    });

    if (res.ok) {
      const d = await res.json();
      return (d.content || []).map(c => c.text || "").join("").trim();
    }

    const errText = await res.text().catch(() => "");
    if (res.status === 429) {
      // Rate limited — wait longer each retry
      const delay = [8000, 20000, 40000][attempt] || 40000;
      if (attempt < retries) { await new Promise(r => setTimeout(r, delay)); continue; }
      throw new Error("RATE_LIMIT");
    }
    if (res.status === 401) throw new Error("INVALID_KEY");
    if (res.status === 400 && errText.includes("credit_balance_too_low")) throw new Error("LOW_CREDITS");
    throw new Error("HTTP " + res.status + ": " + errText.slice(0, 200));
  }
}

// ─── SVG IMAGE GENERATION ────────────────────────────────────────────────────
function makeFoodSVG(title, category) {
  const t = (title||"").toLowerCase();
  const isSalmon = /salmon|fish|tuna/.test(t);
  const isOats = /oat|porridge|overnight/.test(t);
  const isMatcha = /matcha|latte|green tea/.test(t);
  const isDessert = category==="dessert" || /chocolate|mousse|cake/.test(t);
  const isEgg = /egg|omelette/.test(t);
  const enc = s => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
  const bg = "<defs><radialGradient id=\"bg\"><stop offset=\"0%\" stop-color=\"#f5f0ea\"/><stop offset=\"100%\" stop-color=\"#ede7dd\"/></radialGradient><radialGradient id=\"plate\"><stop offset=\"0%\" stop-color=\"#fff\"/><stop offset=\"100%\" stop-color=\"#e8e2d8\"/></radialGradient><filter id=\"sh\"><feDropShadow dx=\"0\" dy=\"6\" stdDeviation=\"10\" flood-color=\"rgba(0,0,0,0.2)\"/></filter></defs><rect width=\"800\" height=\"520\" fill=\"url(#bg)\"/>";
  if (isOats) return enc(`<svg viewBox="0 0 800 520" xmlns="http://www.w3.org/2000/svg">${bg}<ellipse cx="400" cy="275" rx="200" ry="185" fill="url(#plate)" filter="url(#sh)"/><ellipse cx="400" cy="278" rx="170" ry="155" fill="#f8eed8"/><circle cx="340" cy="215" r="18" fill="#4040c0" opacity="0.85"/><circle cx="365" cy="205" r="14" fill="#5050d0" opacity="0.8"/><circle cx="380" cy="220" r="16" fill="#3030b0" opacity="0.85"/><circle cx="420" cy="210" r="15" fill="#4040c0" opacity="0.8"/><path d="M360,270 Q400,258 440,272" stroke="#c08020" stroke-width="5" fill="none" opacity="0.75" stroke-linecap="round"/><ellipse cx="460" cy="245" rx="18" ry="9" fill="#2d8a30" opacity="0.85" transform="rotate(-30,460,245)"/></svg>`);
  if (isMatcha) return enc(`<svg viewBox="0 0 800 520" xmlns="http://www.w3.org/2000/svg">${bg}<ellipse cx="350" cy="270" rx="125" ry="120" fill="#1a5c10" filter="url(#sh)"/><ellipse cx="350" cy="268" rx="115" ry="110" fill="#4a9828" opacity="0.9"/><ellipse cx="350" cy="264" rx="95" ry="90" fill="#fff" opacity="0.65"/><ellipse cx="570" cy="220" rx="72" ry="65" fill="#e8e4dc" filter="url(#sh)"/><ellipse cx="570" cy="218" rx="58" ry="52" fill="#a8c840" opacity="0.85"/></svg>`);
  if (isDessert) return enc(`<svg viewBox="0 0 800 520" xmlns="http://www.w3.org/2000/svg">${bg}<ellipse cx="400" cy="278" rx="195" ry="180" fill="url(#plate)" filter="url(#sh)"/><ellipse cx="400" cy="278" rx="165" ry="150" fill="#2a1408"/><path d="M300,250 Q340,235 380,255 T440,248" stroke="#5a3018" stroke-width="3" fill="none" opacity="0.5"/><ellipse cx="400" cy="220" rx="52" ry="38" fill="#fffef8" opacity="0.92"/><circle cx="470" cy="218" r="14" fill="#cc2040" opacity="0.9"/><circle cx="490" cy="232" r="12" fill="#cc2040" opacity="0.85"/></svg>`);
  if (isEgg) return enc(`<svg viewBox="0 0 800 520" xmlns="http://www.w3.org/2000/svg">${bg}<ellipse cx="400" cy="275" rx="215" ry="195" fill="url(#plate)" filter="url(#sh)"/><ellipse cx="395" cy="278" rx="172" ry="132" fill="#f5d050" transform="rotate(-8,395,278)"/><ellipse cx="340" cy="270" rx="22" ry="11" fill="#2a7020" opacity="0.8" transform="rotate(-20,340,270)"/><circle cx="430" cy="265" r="12" fill="#d83030" opacity="0.82"/></svg>`);
  if (isSalmon) return enc(`<svg viewBox="0 0 800 520" xmlns="http://www.w3.org/2000/svg">${bg}<ellipse cx="400" cy="275" rx="225" ry="205" fill="url(#plate)" filter="url(#sh)"/><ellipse cx="390" cy="295" rx="168" ry="142" fill="#f8f0d8"/><ellipse cx="430" cy="255" rx="112" ry="70" fill="#e8622a" filter="url(#sh)" transform="rotate(-12,430,255)"/><ellipse cx="425" cy="290" rx="105" ry="16" fill="#c84820" opacity="0.6" transform="rotate(-12,425,290)"/><path d="M575,158 Q618,130 638,168 Q618,206 575,196 Z" fill="#f0e040"/></svg>`);
  return enc(`<svg viewBox="0 0 800 520" xmlns="http://www.w3.org/2000/svg">${bg}<ellipse cx="400" cy="275" rx="210" ry="195" fill="url(#plate)" filter="url(#sh)"/><ellipse cx="400" cy="278" rx="175" ry="160" fill="#f5eac8"/><ellipse cx="445" cy="248" rx="98" ry="70" fill="#c87830" filter="url(#sh)" transform="rotate(-12,445,248)"/><circle cx="295" cy="225" r="27" fill="#2a7020"/><circle cx="295" cy="225" r="20" fill="#3a8a2a"/></svg>`);
}

async function aiGenerateHeroSVG(title, category, ingredients) {
  try {
    const ingredientList = (ingredients||[]).map(i=>i.name).slice(0,6).join(", ");
    const text = await anthropicCall({
      max_tokens: 5000,
      system: "You are a food SVG illustrator. Create a clean overhead studio shot SVG (viewBox=\"0 0 800 520\"). Style: direct overhead angle, soft studio lighting, marble or wood kitchen counter surface. Show ingredients realistically cut, chopped, or arranged in a white ceramic bowl or on a plate. Use radialGradient fills, feDropShadow filters, realistic vibrant food colors. NO text. Return ONLY the SVG starting with <svg.",
      messages: [{role:"user",content:`Overhead studio food illustration for: ${title}. Show these ingredients cut and arranged naturally: ${ingredientList}`}]
    });
    const m = text.match(/<svg[\s\S]*<\/svg>/i);
    if (m) return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(m[0]);
  } catch(e) {}
  return null;
}

async function fetchPageContent(url) {
  try {
    const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, {signal:AbortSignal.timeout(9000)});
    if (!res.ok) return null;
    const d = await res.json();
    const html = d.contents || '';
    const ogImg = (html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i) || html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:image"/i) || [])[1] || null;
    const text = html.replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,10000);
    return {text, ogImg};
  } catch(e) { return null; }
}

async function fetchPexelsImage(title) {
  const key = pwaGet('pexels_key');
  if (!key) return null;
  const q = encodeURIComponent((title||'') + ' food meal');
  try {
    const res = await fetch(`https://api.pexels.com/v1/search?query=${q}&per_page=1&orientation=landscape`, {
      headers: { Authorization: key }
    });
    if (!res.ok) return null;
    const d = await res.json();
    return d.photos?.[0]?.src?.medium || null;
  } catch(e) { return null; }
}

// ─── AI EXTRACTION ────────────────────────────────────────────────────────────
async function aiExtractRecipeFromImage(base64DataUrl) {
  const match = base64DataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) throw new Error("Invalid image format");
  const mediaType = match[1];
  const base64Data = match[2];
  const tagList = ALL_TAGS.join(", ");

  const prompt = `Extract the complete recipe from this image. Read every ingredient, amount, step, and time you can see.

Respond with ONLY a valid JSON object. No markdown.

{
  "title": "Recipe Name",
  "category": "breakfast",
  "tags": ["High Protein"],
  "allergens": [],
  "equipment": ["stove"],
  "type": {"protein": true, "grain": false, "side": false},
  "nutrition": {"calories": 420, "protein": 35, "carbs": 40, "fat": 12},
  "goal": ["gain muscle"],
  "prepTime": 10, "cookTime": 25, "totalTime": 35, "servings": 2,
  "description": "Two-sentence description.",
  "ingredients": [{"name": "Chicken Breast", "amount": 2, "unit": "pcs"}],
  "steps": [{"text": "Detailed step.", "timeMin": 5, "image": null, "imagePrompt": "overhead studio shot on white marble"}],
  "sourceUrl": "", "sourceType": "photo", "difficulty": "beginner",
  "healthBenefits": "", "antiInflammatory": false, "bloodSugarFriendly": false
}

RULES:
- category: breakfast, lunch, dessert, or drink
- tags from: ${tagList}
- allergens from: ${ALLERGENS_LIST.join(", ")}
- equipment from: ${EQUIPMENT_LIST.join(", ")}
- goal from: ${GOALS.join(", ")}
- 4-10 ingredients, 3-12 steps
- difficulty: beginner, intermediate, or advanced
- Extract EVERYTHING visible: all ingredients with exact amounts/units, every step in order
- If nutrition is shown extract it, otherwise estimate from ingredients
- Fill any missing info using culinary knowledge`;

  const raw = await anthropicCall({
    max_tokens: 4000,
    system: "You are a culinary AI that reads recipes from photos of recipe cards, cookbooks, or handwritten notes. Respond ONLY with a valid JSON object starting with { and ending with }. No markdown.",
    messages: [{role:"user", content:[
      {type:"image", source:{type:"base64", media_type:mediaType, data:base64Data}},
      {type:"text", text:prompt}
    ]}]
  });
  const stripped = raw.replace(/^```(?:json)?\s*/im,"").replace(/\s*```\s*$/im,"").trim();
  const jStart = stripped.indexOf("{"), jEnd = stripped.lastIndexOf("}");
  if (jStart===-1||jEnd===-1) throw new Error("No JSON in response");
  const recipe = JSON.parse(stripped.slice(jStart, jEnd+1));
  recipe.totalTime = recipe.totalTime || (recipe.prepTime||0)+(recipe.cookTime||0);
  if (recipe.antiInflammatory && !(recipe.tags||[]).includes("Anti-Inflammatory")) recipe.tags=[...(recipe.tags||[]),"Anti-Inflammatory"];
  if (recipe.bloodSugarFriendly && !(recipe.tags||[]).includes("Blood Sugar Stable")) recipe.tags=[...(recipe.tags||[]),"Blood Sugar Stable"];
  recipe.image = base64DataUrl; // photo taken becomes the recipe image
  return {...recipe, id:Date.now()};
}

async function aiExtractRecipe(input) {
  const isUrl = input.trim().startsWith("http");
  const src = isUrl ? (input.includes("tiktok")?"TikTok video":input.includes("instagram")?"Instagram reel":input.includes("youtu")?"YouTube video":"recipe webpage") : "text description";
  const tagList = ALL_TAGS.join(", ");

  let pageText = null, pageImage = null;
  if (isUrl) {
    const page = await fetchPageContent(input.trim());
    if (page) { pageText = page.text; pageImage = page.ogImg; }
  }

  const prompt = `Extract a complete recipe from this ${src}.
${isUrl ? "SOURCE URL: " + input : "DESCRIPTION: " + input}
${pageText ? "\nPAGE CONTENT (use this to extract the real recipe):\n" + pageText : (isUrl ? "\nPage could not be fetched — infer recipe from the URL path using culinary knowledge. ALWAYS produce a full recipe." : "")}

Respond with ONLY a valid JSON object. No markdown.

{
  "title": "Recipe Name",
  "category": "breakfast",
  "tags": ["High Protein"],
  "allergens": [],
  "equipment": ["stove"],
  "type": {"protein": true, "grain": false, "side": false},
  "nutrition": {"calories": 420, "protein": 35, "carbs": 40, "fat": 12},
  "goal": ["gain muscle"],
  "prepTime": 10, "cookTime": 25, "totalTime": 35, "servings": 2,
  "description": "Two-sentence description.",
  "ingredients": [{"name": "Chicken Breast", "amount": 2, "unit": "pcs"}],
  "steps": [{"text": "Detailed step.", "timeMin": 5, "image": null, "imagePrompt": "overhead studio shot on white marble"}],
  "sourceUrl": "${isUrl ? input : ""}",
  "sourceType": "${src}",
  "difficulty": "beginner",
  "healthBenefits": "",
  "antiInflammatory": false,
  "bloodSugarFriendly": false
}

RULES:
- category: breakfast, lunch, dessert, or drink
- tags from: ${tagList}
- allergens from: ${ALLERGENS_LIST.join(", ")}
- equipment from: ${EQUIPMENT_LIST.join(", ")}
- goal from: ${GOALS.join(", ")}
- 4-10 ingredients, 3-12 steps, each step has realistic timeMin and imagePrompt
- difficulty: beginner, intermediate, or advanced`;

  const raw = await anthropicCall({
    max_tokens: 4000,
    system: "You are a culinary AI. Respond ONLY with a valid JSON object starting with { and ending with }. No markdown.",
    messages: [{role:"user",content:prompt}]
  });
  const stripped = raw.replace(/^```(?:json)?\s*/im,"").replace(/\s*```\s*$/im,"").trim();
  const jStart = stripped.indexOf("{"), jEnd = stripped.lastIndexOf("}");
  if (jStart===-1||jEnd===-1) throw new Error("No JSON found");
  const recipe = JSON.parse(stripped.slice(jStart, jEnd+1));
  recipe.totalTime = recipe.totalTime || (recipe.prepTime||0) + (recipe.cookTime||0);
  if (recipe.antiInflammatory && !(recipe.tags||[]).includes("Anti-Inflammatory")) recipe.tags = [...(recipe.tags||[]), "Anti-Inflammatory"];
  if (recipe.bloodSugarFriendly && !(recipe.tags||[]).includes("Blood Sugar Stable")) recipe.tags = [...(recipe.tags||[]), "Blood Sugar Stable"];
  if (pageImage && !recipe.image) recipe.image = pageImage;
  return {...recipe, id:Date.now()};
}

// ─── PDF EXPORT ──────────────────────────────────────────────────────────────
// Pre-fetch an image URL → base64 data URI so PDF windows don't need async loading
async function toBase64(url) {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const rd = new FileReader();
      rd.onloadend = () => resolve(rd.result);
      rd.onerror = reject;
      rd.readAsDataURL(blob);
    });
  } catch(e) { return null; }
}

async function exportRecipeToPDF(recipe, scale) {
  const s = scale || recipe.servings || 1;
  const r = s / (recipe.servings||1);

  // Open window immediately — must be synchronous inside the click handler
  const win = window.open("","_blank");
  if (!win) { alert("Please allow pop-ups for this site to export PDFs."); return; }
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Loading…</title>
  <style>body{display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:'Segoe UI',sans-serif;color:#888;background:#fff;flex-direction:column;gap:14px}
  .sp{width:40px;height:40px;border:4px solid #eee;border-top-color:#555;border-radius:50%;animation:sp .8s linear infinite}
  @keyframes sp{to{transform:rotate(360deg)}}</style></head>
  <body><div class="sp"></div><div>Preparing PDF…</div></body></html>`);
  win.document.close();

  // Pre-fetch every image as an inline base64 data URI — eliminates all async loading issues
  const [heroB64, ingOverallB64] = await Promise.all([toBase64(recipe.image), toBase64(recipe.ingredientsImage)]);
  const ingB64s = await Promise.all((recipe.ingredients||[]).map(i => toBase64(i.image)));
  const stepImgB64s = await Promise.all((recipe.steps||[]).map(step => Promise.all(getStepImages(step).map(toBase64))));

  const PRINT_CSS = `
    @media print {
      button { display: none !important; }
      body { padding: 0 !important; }
      img { max-width: 100% !important; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .hero { max-height: 260px !important; border-radius: 0 !important; }
      .step-img-wrap,.ing-overall-wrap,.step-imgs { background: #f5f5f5 !important; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .step-img,.ing-overall { max-width: 100% !important; }
      .step-card { break-inside: avoid; page-break-inside: avoid; }
      .ing-emoji { background: #f5f5f5 !important; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .nutrition { background: #f9f9f9 !important; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${recipe.title}</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:'Segoe UI',sans-serif;max-width:720px;margin:0 auto;padding:32px 28px;color:#1a1a1a}
    h1{font-family:Georgia,serif;font-size:28px;margin:0 0 6px}
    .meta{color:#666;font-size:13px;margin-bottom:14px}
    .tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px}
    .tag{background:#f0f0f0;border-radius:20px;padding:3px 10px;font-size:12px}
    .health{background:#e8f5e9;color:#2e7d32}
    .hero{width:100%;max-height:300px;object-fit:cover;border-radius:10px;margin-bottom:18px;display:block;print-color-adjust:exact;-webkit-print-color-adjust:exact}
    .nutrition{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;background:#f9f9f9;border-radius:10px;padding:14px;margin:14px 0}
    .nbox{text-align:center}.nval{font-size:20px;font-weight:700}.nlbl{font-size:10px;color:#888;text-transform:uppercase;margin-top:2px}
    .stitle{font-size:17px;font-weight:700;border-bottom:2px solid #eee;padding-bottom:5px;margin:18px 0 10px;font-family:Georgia,serif}
    .ing{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid #f0f0f0;font-size:14px}
    .ing-thumb{width:42px;height:42px;border-radius:6px;object-fit:contain;background:#f5f5f5;flex-shrink:0}
    .ing-emoji{width:42px;height:42px;border-radius:6px;background:#f5f5f5;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}
    .ing-name{flex:1}.amt{font-weight:600;color:#2e7d32;white-space:nowrap}
    .ing-overall-wrap{background:#f5f5f5;border-radius:8px;margin-bottom:10px;text-align:center;padding:4px}
    .ing-overall{max-width:100%;max-height:240px;width:auto;height:auto;display:inline-block;border-radius:6px}
    .step-card{margin-bottom:14px;border-radius:10px;overflow:hidden;border:1px solid #eee}
    .step-img-wrap{background:#f5f5f5;text-align:center;padding:8px}
    .step-img{max-width:100%;max-height:300px;width:auto;height:auto;display:inline-block;border-radius:6px}
    .step-imgs{display:flex;gap:6px;padding:8px;background:#f5f5f5;justify-content:center;flex-wrap:wrap}
    .step-imgs img{max-width:48%;max-height:200px;width:auto;height:auto;border-radius:6px}
    .step-body{display:flex;gap:12px;padding:12px;background:#fafafa}
    .snum{min-width:26px;height:26px;border-radius:50%;background:#333;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;flex-shrink:0;margin-top:2px}
    .stext{font-size:14px;flex:1;line-height:1.6;margin:0}.stime{color:#888;font-size:12px;margin-top:3px}
    .hbnote{background:#e8f5e9;border-left:4px solid #4caf50;padding:10px 14px;border-radius:0 8px 8px 0;font-size:13px;color:#2e7d32;margin:10px 0}
    .printbtn{display:block;margin:24px auto 0;background:#333;color:#fff;border:none;border-radius:8px;padding:11px 28px;font-size:14px;cursor:pointer;font-family:inherit}
    ${PRINT_CSS}
  </style></head><body>
  ${heroB64 ? `<img src="${heroB64}" class="hero" alt="${recipe.title}"/>` : ""}
  <h1>${recipe.title}${(recipe.spiceLevel||0)>0?` ${"🌶️".repeat(recipe.spiceLevel)}`:""}</h1>
  <div class="meta">${recipe.category}${recipe.cuisine?" · 🌍 "+recipe.cuisine:""} · ${recipe.prepTime||0}min prep · ${recipe.cookTime||0}min cook · ${recipe.totalTime||0}min total · ${s} servings</div>
  ${recipe.healthBenefits ? `<div class="hbnote">${recipe.healthBenefits}</div>` : ""}
  <div class="tags">${(recipe.tags||[]).map(t=>`<span class="tag ${HEALTH_TAGS.includes(t)?"health":""}">${t}</span>`).join("")}${(recipe.allergens||[]).map(a=>`<span class="tag" style="background:#fff3e0;color:#e65100">⚠ ${a}</span>`).join("")}</div>
  <div class="nutrition">
    ${[["Calories",Math.round(recipe.nutrition.calories*r),""],["Protein",Math.round(recipe.nutrition.protein*r),"g"],["Carbs",Math.round(recipe.nutrition.carbs*r),"g"],["Fat",Math.round(recipe.nutrition.fat*r),"g"]].map(([l,v,u])=>`<div class="nbox"><div class="nval">${v}${u}</div><div class="nlbl">${l}</div></div>`).join("")}
  </div>
  <div class="stitle">Ingredients <small style="font-weight:400;color:#888">(${s} servings)</small></div>
  ${ingOverallB64 ? `<div class="ing-overall-wrap"><img src="${ingOverallB64}" class="ing-overall" alt="All ingredients"/></div>` : ""}
  ${(recipe.ingredients||[]).map((ing,i)=>`<div class="ing">
    ${ingB64s[i] ? `<img src="${ingB64s[i]}" class="ing-thumb" alt="${ing.name}"/>` : `<div class="ing-emoji">${getItemEmoji(ing.name)}</div>`}
    <span class="ing-name">${ing.name}</span>
    <span class="amt">${scaleAmt(ing.amount,r)} ${ing.unit}</span>
  </div>`).join("")}
  <div class="stitle">Steps</div>
  ${(recipe.steps||[]).map((step,i)=>{
    const imgs = stepImgB64s[i].filter(Boolean);
    return `<div class="step-card">
      ${imgs.length===1 ? `<div class="step-img-wrap"><img src="${imgs[0]}" class="step-img" alt="Step ${i+1}"/></div>` : imgs.length>1 ? `<div class="step-imgs">${imgs.map(b=>`<img src="${b}" alt=""/>`).join("")}</div>` : ""}
      <div class="step-body">
        <div class="snum">${i+1}</div>
        <div style="flex:1"><p class="stext">${step.text}</p>${step.timeMin?`<div class="stime">⏱ ${step.timeMin} min</div>`:""}</div>
      </div>
    </div>`;
  }).join("")}
  <div style="margin-top:24px;padding-top:12px;border-top:1px solid #eee;color:#aaa;font-size:11px;text-align:center">MealPrepMaster · ${new Date().toLocaleDateString()}</div>
  <button class="printbtn" onclick="window.print()">🖨 Print / Save PDF</button>
  </body></html>`;

  // Use Blob URL to navigate the popup — more reliable than document.write after async
  const blob = new Blob([html], {type:'text/html;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  win.location.replace(url);
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}

async function exportMealBookToPDF(recipes, title) {
  const win = window.open("","_blank");
  if (!win) { alert("Please allow pop-ups for this site to export PDFs."); return; }
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Loading…</title>
  <style>body{display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:'Segoe UI',sans-serif;color:#888;flex-direction:column;gap:14px}
  .sp{width:40px;height:40px;border:4px solid #eee;border-top-color:#555;border-radius:50%;animation:sp .8s linear infinite}
  @keyframes sp{to{transform:rotate(360deg)}}</style></head>
  <body><div class="sp"></div><div>Preparing PDF…</div></body></html>`);
  win.document.close();

  const recipeData = await Promise.all(recipes.map(async rec => {
    const heroB64 = await toBase64(rec.image);
    const ingB64s = await Promise.all((rec.ingredients||[]).map(i => toBase64(i.image)));
    const stepImgB64s = await Promise.all((rec.steps||[]).map(step => Promise.all(getStepImages(step).map(toBase64))));
    return {heroB64, ingB64s, stepImgB64s};
  }));

  const pages = recipes.map((r,idx)=>{
    const {heroB64, ingB64s, stepImgB64s} = recipeData[idx];
    return `<div style="page-break-before:${idx>0?"always":"auto"};padding:24px 28px">
      ${heroB64 ? `<img src="${heroB64}" style="width:100%;max-height:220px;object-fit:cover;border-radius:8px;margin-bottom:12px;display:block;print-color-adjust:exact;-webkit-print-color-adjust:exact" alt="${r.title}"/>` : ""}
      <h2 style="font-family:Georgia,serif;font-size:21px;margin:0 0 4px">${r.title}${(r.spiceLevel||0)>0?` ${"🌶️".repeat(r.spiceLevel)}`:""}</h2>
      <div style="color:#666;font-size:12px;margin-bottom:8px">${r.category}${r.cuisine?" · 🌍 "+r.cuisine:""} · ${r.totalTime||0}min · ${r.servings} servings</div>
      ${(r.tags||[]).slice(0,5).map(t=>`<span style="background:#f0f0f0;border-radius:20px;padding:2px 8px;font-size:11px;margin-right:4px">${t}</span>`).join("")}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:12px 0">
        <div>
          <b style="font-size:13px">Ingredients</b><br/><br/>
          ${(r.ingredients||[]).map((ing,i)=>`<div style="font-size:12px;padding:4px 0;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;gap:7px">
            ${ingB64s[i] ? `<img src="${ingB64s[i]}" style="width:24px;height:24px;border-radius:4px;object-fit:cover;flex-shrink:0"/>` : `<span style="font-size:14px">${getItemEmoji(ing.name)}</span>`}
            <span style="flex:1">${ing.name}</span><span style="color:#2e7d32;font-weight:600;white-space:nowrap">${ing.amount} ${ing.unit}</span>
          </div>`).join("")}
        </div>
        <div>
          <b style="font-size:13px">Steps</b><br/><br/>
          ${(r.steps||[]).map((step,i)=>{
            const imgs = stepImgB64s[i].filter(Boolean);
            return `${imgs.length>0?`<div style="display:flex;gap:3px;margin-bottom:4px">${imgs.map(b=>`<img src="${b}" style="flex:1;min-width:0;height:55px;object-fit:cover;border-radius:4px;print-color-adjust:exact;-webkit-print-color-adjust:exact"/>`).join("")}</div>`:""}
            <div style="font-size:12px;margin-bottom:6px"><b>${i+1}.</b> ${step.text}${step.timeMin?` <span style="color:#888">(${step.timeMin}m)</span>`:""}</div>`;
          }).join("")}
        </div>
      </div>
    </div>`;
  }).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title||"Meal Book"}</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:'Segoe UI',sans-serif;max-width:800px;margin:0 auto;color:#1a1a1a}
    @media print{button{display:none!important}img{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
  </style>
  </head><body>
  <div style="text-align:center;padding:48px 0;border-bottom:3px solid #333;margin-bottom:24px">
    <div style="font-size:36px;margin-bottom:8px">🥗</div>
    <h1 style="font-family:Georgia,serif;font-size:32px;margin:0 0 6px">${title||"My Meal Book"}</h1>
    <div style="color:#666;font-size:14px">${recipes.length} recipes · ${new Date().toLocaleDateString()}</div>
  </div>
  ${pages}
  <div style="text-align:center;margin:32px 0"><button onclick="window.print()" style="background:#333;color:#fff;border:none;border-radius:8px;padding:12px 28px;font-size:15px;cursor:pointer;font-family:inherit">🖨 Print / Save PDF</button></div>
  </body></html>`;

  const blob = new Blob([html], {type:'text/html;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  win.location.replace(url);
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}


// ─── STYLE CONSTANTS ─────────────────────────────────────────────────────────
const IS = {background:"var(--nm-input-bg)",boxShadow:"var(--nm-inset)",border:"none",borderRadius:10,color:"var(--text)",padding:"10px 14px",fontSize:14,outline:"none",width:"100%",boxSizing:"border-box",fontFamily:"inherit"};
const GB = {background:"var(--bg-card)",boxShadow:"var(--nm-raised-sm)",border:"none",borderRadius:10,color:"var(--text)",padding:"8px 16px",cursor:"pointer",fontSize:13,fontWeight:600,fontFamily:"inherit",transition:"box-shadow .15s"};
const CB = {boxShadow:"var(--nm-raised-sm)",border:"none",borderRadius:20,padding:"5px 13px",cursor:"pointer",fontSize:12,fontFamily:"inherit",background:"var(--bg-card)",color:"var(--text-sub)"};

// ─── SMALL COMPONENTS ────────────────────────────────────────────────────────
const TagChip = ({label,color="#3a7d5e"}) => (
  <span style={{background:color+"2a",color,border:"1px solid "+color+"55",borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>{label}</span>
);

const NutriBadge = ({n}) => (
  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
    {[["🔥",n.calories,"kcal"],["💪",n.protein,"g P"],["🌾",n.carbs,"g C"],["🥑",n.fat,"g F"]].map(([ico,v,l]) => (
      <span key={l} style={{background:"var(--nm-input-bg)",boxShadow:"var(--nm-inset)",borderRadius:20,padding:"2px 8px",color:"var(--text-sub)",fontSize:11}}>{ico} {v}{l}</span>
    ))}
  </div>
);

// ─── SMART IMAGE ─────────────────────────────────────────────────────────────
function SmartImage({recipe, style, regen=0, objectFit="cover"}) {
  const [src, setSrc] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (recipe.image && regen === 0) { setSrc(recipe.image); setLoading(false); return; }
    setSrc(makeFoodSVG(recipe.title, recipe.category));
    setLoading(true);
    fetchPexelsImage(recipe.title).then(pexelsUrl => {
      if (cancelled) return;
      if (pexelsUrl) { setSrc(pexelsUrl); setLoading(false); return; }
      aiGenerateHeroSVG(recipe.title, recipe.category, recipe.ingredients).then(aiUrl => {
        if (!cancelled && aiUrl) setSrc(aiUrl);
        if (!cancelled) setLoading(false);
      });
    });
    return () => { cancelled = true; };
  }, [recipe.id, regen]);

  return (
    <div style={{position:"relative",...style}}>
      {src && <img src={src} alt={recipe.title} style={{width:"100%",height:"100%",objectFit}} onError={e=>{e.target.src=makeFoodSVG(recipe.title,recipe.category);}}/>}
      {loading && <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.3)",fontSize:11,color:"rgba(255,255,255,0.6)"}}>Generating...</div>}
    </div>
  );
}

// ─── RECIPE CARD ─────────────────────────────────────────────────────────────
function RecipeCard({recipe, onClick, onFavorite, isFavorite, costPerServing}) {
  const total = recipe.totalTime || (recipe.prepTime||0) + (recipe.cookTime||0);
  const isHealth = (recipe.tags||[]).some(t => HEALTH_TAGS.includes(t));
  return (
    <div style={{background:"var(--bg-card)",boxShadow:isHealth?"var(--nm-raised),0 0 0 2px var(--accent)30":"var(--nm-raised)",borderRadius:18,overflow:"hidden",transition:"all .2s",position:"relative",cursor:"pointer"}}
      onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-4px)";e.currentTarget.style.boxShadow="var(--nm-inset)";}}
      onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow=isHealth?"var(--nm-raised),0 0 0 2px var(--accent)30":"var(--nm-raised)";}}>
      <div onClick={()=>onClick(recipe)}>
        <div style={{position:"relative",height:180}}>
          <SmartImage recipe={recipe} style={{width:"100%",height:"100%"}}/>
          <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(13,15,23,.96) 0%,transparent 52%)"}}/>
          <span style={{position:"absolute",top:9,left:9,background:"rgba(13,15,23,.85)",color:"#ffd580",fontSize:10,padding:"3px 8px",borderRadius:8,fontWeight:700}}>
            {(CATEGORIES.find(c=>c.id===recipe.category)||{}).icon} {recipe.category}
          </span>
          {total > 0 && <span style={{position:"absolute",top:9,right:9,background:"rgba(13,15,23,.85)",color:"#5aad8e",fontSize:11,padding:"3px 9px",borderRadius:8,fontWeight:700}}>{total}min</span>}
          <div style={{position:"absolute",bottom:10,left:12,right:12}}>
            <div style={{color:"#fff",fontWeight:700,fontSize:14,fontFamily:"'Playfair Display',serif",lineHeight:1.3}}>{recipe.title}</div>
          </div>
          {recipe.sourceUrl && (
            <span style={{position:"absolute",bottom:10,right:10,background:"rgba(13,15,23,.85)",color:"#a0c0f0",fontSize:10,padding:"2px 7px",borderRadius:7,fontWeight:700}}>
              {/tiktok/.test(recipe.sourceUrl)?"📱 TikTok":/youtu/.test(recipe.sourceUrl)?"▶ YT":/instagram/.test(recipe.sourceUrl)?"📸 IG":"🌐 Web"}
            </span>
          )}
        </div>
        <div style={{padding:"10px 12px 12px"}}>
          <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:7}}>
            {recipe.cuisine && <TagChip label={"🌍 "+recipe.cuisine} color={CUISINE_COLORS[recipe.cuisine]||"#888"}/>}
            {(recipe.tags||[]).slice(0,2).map(t=><TagChip key={t} label={t} color={ALL_TAG_COLORS[t]||"#888"}/>)}
          </div>
          <NutriBadge n={recipe.nutrition}/>
          {costPerServing !== undefined && (
            <div style={{marginTop:6,display:"flex",alignItems:"center",gap:4}}>
              <span style={{background:"rgba(90,173,142,0.15)",border:"1px solid rgba(90,173,142,0.3)",borderRadius:20,padding:"2px 8px",color:"#5aad8e",fontSize:11,fontWeight:700}}>💰 ~${costPerServing.toFixed(1)}/serving</span>
            </div>
          )}
          <div style={{marginTop:7,display:"flex",gap:10,fontSize:11,color:"var(--text-muted)",flexWrap:"wrap",alignItems:"center"}}>
            <span>{recipe.prepTime||0}m prep</span>
            <span>{recipe.cookTime||0}m cook</span>
            <span>{recipe.servings} servings</span>
            {(recipe.spiceLevel||0) > 0 && <span style={{color:"#e05050"}}>{"🌶".repeat(recipe.spiceLevel)}</span>}
          </div>
        </div>
      </div>
      {onFavorite && (
        <button onClick={e=>{e.stopPropagation();onFavorite(recipe);}}
          style={{position:"absolute",top:46,right:8,background:isFavorite?"rgba(192,80,80,0.85)":"rgba(0,0,0,0.6)",border:"none",borderRadius:"50%",width:30,height:30,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",zIndex:2}}>
          {isFavorite ? "♥" : "♡"}
        </button>
      )}
    </div>
  );
}

// ─── RECIPE DETAIL ────────────────────────────────────────────────────────────
function RecipeDetail({recipe:init, onClose, onFavorite, isFavorite, onRate, ratings, onEdit, onMarkCooked}) {
  const [recipe, setRecipe] = useState(init);
  const [scale, setScale] = useState(init.servings||1);
  const [genIdx, setGenIdx] = useState(null);
  const [imgVer, setImgVer] = useState(0);
  const [timers, setTimers] = useState({});
  const timerRefs = useRef({});
  const [subFor, setSubFor] = useState(null);
  const [subs, setSubs] = useState({});
  const [subLoading, setSubLoading] = useState(null);
  const [cookMode, setCookMode] = useState(false);
  const mainImgRef = useRef(null);
  const stepImgRefs = useRef({});
  const ingImgRefs = useRef({});
  const ingOverallRef = useRef(null);

  const uploadMainImg = e => {
    const f = e.target.files?.[0]; if (!f) return;
    const rd = new FileReader(); rd.onload = ev => setRecipe(p=>({...p,image:ev.target.result})); rd.readAsDataURL(f);
  };
  const uploadStepImg = (i, e) => {
    const files = Array.from(e.target.files||[]); if (!files.length) return;
    files.forEach(f => {
      const rd = new FileReader();
      rd.onload = ev => setRecipe(p=>{
        const s=[...p.steps];
        const existing = getStepImages(s[i]);
        s[i]={...s[i], images:[...existing, ev.target.result]};
        return{...p,steps:s};
      });
      rd.readAsDataURL(f);
    });
    e.target.value = "";
  };
  const uploadIngImg = (i, e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const rd = new FileReader(); rd.onload = ev => setRecipe(p=>{const a=[...p.ingredients];a[i]={...a[i],image:ev.target.result};return{...p,ingredients:a};}); rd.readAsDataURL(f);
  };
  const uploadIngOverall = e => {
    const f = e.target.files?.[0]; if (!f) return;
    const rd = new FileReader(); rd.onload = ev => setRecipe(p=>({...p,ingredientsImage:ev.target.result})); rd.readAsDataURL(f);
  };
  const deleteStepImg = (stepIdx, imgIdx) => setRecipe(p=>{
    const s=[...p.steps];
    const imgs = getStepImages(s[stepIdx]).filter((_,j)=>j!==imgIdx);
    s[stepIdx]={...s[stepIdx], images:imgs, image:imgs[0]||null};
    return{...p,steps:s};
  });
  const r = scale / (recipe.servings||1);
  const total = recipe.totalTime||(recipe.prepTime||0)+(recipe.cookTime||0);
  const diff = DIFFICULTIES[recipe.difficulty||"beginner"]||DIFFICULTIES.beginner;
  const myRating = ratings && ratings[recipe.id];

  const startTimer = i => {
    const step = recipe.steps[i];
    const secs = (step.timeMin||1)*60;
    setTimers(t=>({...t,[i]:{remaining:secs,running:true}}));
    timerRefs.current[i] = setInterval(()=>{
      setTimers(t=>{
        const rem = (t[i]&&t[i].remaining)||0;
        if (rem<=1) {
          clearInterval(timerRefs.current[i]);
          alert("Timer done for step "+(i+1)+": "+step.text.slice(0,40));
          return {...t,[i]:{remaining:0,running:false}};
        }
        return {...t,[i]:{remaining:rem-1,running:true}};
      });
    },1000);
  };

  const resetTimer = i => {
    clearInterval(timerRefs.current[i]);
    setTimers(t=>({...t,[i]:null}));
  };

  const fmtTime = secs => {
    const h = Math.floor(secs/3600), m = Math.floor((secs%3600)/60), s = secs%60;
    if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
    return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  };

  const fetchSubs = async ing => {
    setSubFor(ing.name); setSubLoading(ing.name);
    try {
      const text = await anthropicCall({max_tokens:300, messages:[{role:"user",content:"Suggest 4 substitutes for "+ing.name+" in "+recipe.title+". Consider common dietary needs. Reply ONLY with a JSON array of strings."}]});
      const m = text.match(/\[[\s\S]*\]/);
      if (m) { try { setSubs(s=>({...s,[ing.name]:JSON.parse(m[0])})); } catch(e){} }
    } catch(e){}
    setSubLoading(null);
  };

  const getContainerSections = () => {
    const protein=[],grain=[],veggie=[];
    (recipe.ingredients||[]).forEach(ing=>{
      const n=(ing.name||"").toLowerCase();
      if (/chicken|beef|salmon|tuna|fish|shrimp|egg|turkey|pork|lamb|meat|protein|tofu/.test(n)) protein.push(ing);
      else if (/rice|oat|quinoa|pasta|flour|bread|noodle|cereal|tortilla|grain/.test(n)) grain.push(ing);
      else veggie.push(ing);
    });
    return {protein,grain,veggie};
  };

  const shareRecipe = () => {
    const encoded = btoa(encodeURIComponent(JSON.stringify(recipe)));
    const url = window.location.origin + "?recipe=" + encoded;
    navigator.clipboard?.writeText(url).then(()=>alert("📋 Link copied! Share it with anyone.")).catch(()=>prompt("Copy this link:", url));
  };

  const genStepImg = async i => {
    setGenIdx(i);
    try {
      const step = recipe.steps[i];
      const text = await anthropicCall({max_tokens:3000, system:"Create a clean overhead studio shot SVG (viewBox=\"0 0 800 400\"). Marble kitchen counter, studio lighting, show exactly how the ingredient should look at this step — cut, mixed, or cooking in a pan. Realistic food colors, no text. Return ONLY the SVG.", messages:[{role:"user",content:step.imagePrompt||step.text}]});
      const m = text.match(/<svg[\s\S]*<\/svg>/i);
      if (m) { const url="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(m[0]); setRecipe(prev=>{const s=[...prev.steps];s[i]={...s[i],image:url};return{...prev,steps:s};}); }
    } catch(e) {}
    setGenIdx(null);
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:16,overflowY:"auto"}}>
      <div style={{background:"#0d0f17",border:"1px solid rgba(255,255,255,0.07)",borderRadius:24,maxWidth:760,width:"100%",maxHeight:"94vh",overflowY:"auto",boxShadow:"0 48px 120px rgba(0,0,0,0.9)"}}>

        {/* Hero */}
        <div style={{position:"relative",minHeight:220,maxHeight:380,overflow:"hidden",background:"#0d0f17"}}>
          <SmartImage recipe={recipe} style={{width:"100%",maxHeight:380,borderRadius:"24px 24px 0 0"}} regen={imgVer} objectFit="contain"/>
          <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,#11141c 0%,transparent 55%)",borderRadius:"24px 24px 0 0"}}/>
          <input ref={mainImgRef} type="file" accept="image/*" style={{display:"none"}} onChange={uploadMainImg}/>
          <div style={{position:"absolute",top:12,right:12,display:"flex",gap:7}}>
            {onFavorite && <button onClick={()=>onFavorite(recipe)} style={{background:isFavorite?"rgba(192,80,80,0.85)":"rgba(0,0,0,0.7)",border:"none",borderRadius:10,color:"#fff",cursor:"pointer",padding:"6px 12px",fontSize:13,fontFamily:"inherit"}}>{isFavorite?"♥ Saved":"♡ Save"}</button>}
            <button onClick={()=>mainImgRef.current?.click()} title="Upload photo" style={{background:"rgba(0,0,0,0.7)",border:"none",borderRadius:10,color:"#c8d0dc",cursor:"pointer",padding:"6px 10px",fontSize:14,fontFamily:"inherit"}}>📷</button>
            <button onClick={()=>setImgVer(v=>v+1)} title="Regenerate image" style={{background:"rgba(0,0,0,0.7)",border:"none",borderRadius:10,color:"#c8d0dc",cursor:"pointer",padding:"6px 10px",fontSize:14,fontFamily:"inherit"}}>🔄</button>
            <button onClick={()=>exportRecipeToPDF(recipe,scale)} style={{background:"rgba(0,0,0,0.7)",border:"none",borderRadius:10,color:"#c8d0dc",cursor:"pointer",padding:"6px 12px",fontSize:12,fontFamily:"inherit"}}>PDF</button>
            <button onClick={()=>setCookMode(true)} title="Cook Mode" style={{background:"rgba(0,0,0,0.7)",border:"none",borderRadius:10,color:"#c8d0dc",cursor:"pointer",padding:"6px 10px",fontSize:14,fontFamily:"inherit"}}>🍳</button>
            <button onClick={shareRecipe} title="Share recipe" style={{background:"rgba(0,0,0,0.7)",border:"none",borderRadius:10,color:"#c8d0dc",cursor:"pointer",padding:"6px 10px",fontSize:14,fontFamily:"inherit"}}>🔗</button>
            <button onClick={onClose} style={{background:"rgba(0,0,0,0.7)",border:"none",borderRadius:10,color:"#fff",cursor:"pointer",width:34,height:34,fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
          </div>
          <div style={{position:"absolute",bottom:18,left:20,right:60}}>
            <h2 style={{color:"#fff",fontFamily:"'Playfair Display',serif",fontSize:22,margin:"0 0 6px",lineHeight:1.2}}>{recipe.title}</h2>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
              <span style={{background:diff.color+"20",color:diff.color,border:"1px solid "+diff.color+"40",borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:700}}>{diff.icon} {diff.label}</span>
              <span style={{color:"rgba(255,255,255,0.6)",fontSize:12}}>{total}min total · {recipe.servings} servings</span>
              {myRating && <span style={{color:"#ffd580",fontSize:11}}>⭐{myRating.taste||0} 💪{myRating.difficulty||0} 🕐{myRating.timeAccuracy||0} 🌶{myRating.spice||0}</span>}
            </div>
          </div>
        </div>

        <div style={{padding:"20px 24px 28px"}}>
          {/* Tags */}
          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:14}}>
            {(recipe.tags||[]).map(t=><TagChip key={t} label={t} color={ALL_TAG_COLORS[t]||"#888"}/>)}
            {(recipe.allergens||[]).map(a=><TagChip key={a} label={"⚠ "+a} color="#c05050"/>)}
          </div>

          {recipe.healthBenefits && <div style={{background:"rgba(58,125,94,0.1)",border:"1px solid rgba(58,125,94,0.25)",borderRadius:10,padding:"10px 14px",marginBottom:14,color:"#5aad8e",fontSize:13}}>💚 {recipe.healthBenefits}</div>}

          {/* Nutrition + Scale */}
          <div style={{display:"flex",gap:12,marginBottom:18,flexWrap:"wrap",alignItems:"center"}}>
            <NutriBadge n={{calories:Math.round(recipe.nutrition.calories*r),protein:Math.round(recipe.nutrition.protein*r),carbs:Math.round(recipe.nutrition.carbs*r),fat:Math.round(recipe.nutrition.fat*r)}}/>
            <div style={{display:"flex",alignItems:"center",gap:8,marginLeft:"auto"}}>
              <span style={{color:"#6a7a90",fontSize:12}}>Servings:</span>
              <button onClick={()=>setScale(s=>Math.max(1,s-1))} style={{...GB,padding:"3px 10px"}}>−</button>
              <span style={{color:"#fff",fontWeight:700,minWidth:20,textAlign:"center"}}>{scale}</span>
              <button onClick={()=>setScale(s=>s+1)} style={{...GB,padding:"3px 10px"}}>+</button>
            </div>
          </div>

          {/* Two columns */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,marginBottom:20}}>
            {/* Ingredients */}
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <h3 style={{color:"#c8d0dc",fontSize:13,fontWeight:700,letterSpacing:.8,textTransform:"uppercase",margin:0}}>Ingredients</h3>
                <button onClick={()=>ingOverallRef.current?.click()} style={{background:"rgba(90,143,212,0.15)",border:"1px solid rgba(90,143,212,0.3)",borderRadius:7,color:"#7ab0f0",padding:"3px 9px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>📷 All Ingredients</button>
              </div>
              <input ref={ingOverallRef} type="file" accept="image/*" style={{display:"none"}} onChange={uploadIngOverall}/>
              {recipe.ingredientsImage && (
                <div style={{position:"relative",marginBottom:10,borderRadius:10,overflow:"hidden"}}>
                  <img src={recipe.ingredientsImage} alt="All ingredients" style={{width:"100%",maxHeight:220,objectFit:"contain",display:"block",background:"rgba(0,0,0,0.25)",borderRadius:8}}/>
                  <div style={{position:"absolute",top:5,right:5,display:"flex",gap:4}}>
                    <button onClick={()=>ingOverallRef.current?.click()} style={{background:"rgba(0,0,0,0.65)",border:"none",borderRadius:7,color:"#fff",padding:"3px 8px",fontSize:11,cursor:"pointer"}}>📷 Change</button>
                    <button onClick={()=>setRecipe(p=>({...p,ingredientsImage:null}))} style={{background:"rgba(180,40,40,0.75)",border:"none",borderRadius:7,color:"#fff",padding:"3px 8px",fontSize:11,cursor:"pointer"}}>🗑</button>
                  </div>
                </div>
              )}
              {(recipe.ingredients||[]).map((ing,i)=>(
                <div key={i}>
                  <input ref={el=>ingImgRefs.current[i]=el} type="file" accept="image/*" style={{display:"none"}} onChange={e=>uploadIngImg(i,e)}/>
                  <div style={{display:"flex",gap:8,padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,0.05)",fontSize:13,alignItems:"center"}}>
                    {ing.image
                      ? <img src={ing.image} alt={ing.name} style={{width:36,height:36,borderRadius:8,objectFit:"cover",flexShrink:0,cursor:"pointer"}} onClick={()=>ingImgRefs.current[i]?.click()} title="Change photo"/>
                      : <button onClick={()=>ingImgRefs.current[i]?.click()} style={{width:36,height:36,borderRadius:8,border:"1px dashed rgba(255,255,255,0.2)",background:"rgba(255,255,255,0.04)",color:"#6a7a90",fontSize:14,cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}} title="Add photo">📷</button>
                    }
                    <span style={{color:"#c8d0dc",flex:1}}>{ing.name}</span>
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      <span style={{color:"#5aad8e",fontWeight:600}}>{scaleAmt(ing.amount,r)} {ing.unit}</span>
                      <button onClick={()=>subFor===ing.name?setSubFor(null):fetchSubs(ing)} style={{background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:6,color:"#8a9bb0",padding:"1px 6px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}} title="Find substitutes">
                        {subLoading===ing.name?"...":"↔"}
                      </button>
                    </div>
                  </div>
                  {subFor===ing.name && subs[ing.name] && (
                    <div style={{background:"rgba(90,143,212,0.08)",border:"1px solid rgba(90,143,212,0.2)",borderRadius:8,padding:"8px 10px",marginBottom:4,fontSize:12}}>
                      <div style={{color:"#5a8fd4",fontWeight:600,marginBottom:5}}>Substitutes for {ing.name}:</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                        {(subs[ing.name]||[]).map((s,si)=>(
                          <span key={si} style={{background:"rgba(90,143,212,0.15)",color:"#a0c0f0",borderRadius:12,padding:"2px 8px"}}>{s}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {subFor===ing.name && !subs[ing.name] && subLoading===ing.name && (
                    <div style={{color:"#5a8fd4",fontSize:11,padding:"4px 0"}}>Finding substitutes...</div>
                  )}
                </div>
              ))}
            </div>
            {/* Details */}
            <div>
              <h3 style={{color:"#c8d0dc",fontSize:13,fontWeight:700,letterSpacing:.8,textTransform:"uppercase",marginBottom:10}}>Details</h3>
              {[["Prep",recipe.prepTime+"min"],["Cook",recipe.cookTime+"min"],["Total",total+"min"],["Servings",scale],["Calories",Math.round(recipe.nutrition.calories*r)+"kcal"],["Equipment",(recipe.equipment||[]).join(", ")],["Spice",(recipe.spiceLevel||0)===0?"None":"🌶".repeat(recipe.spiceLevel||0)+" "+SPICE_LABELS[recipe.spiceLevel||0]],recipe.cuisine&&["Cuisine","🌍 "+recipe.cuisine]].filter(Boolean).map(([k,v])=>(
                <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,0.05)",fontSize:13}}>
                  <span style={{color:"#6a7a90"}}>{k}</span>
                  <span style={{color:"#c8d0dc"}}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Steps */}
          <h3 style={{color:"#c8d0dc",fontSize:13,fontWeight:700,letterSpacing:.8,textTransform:"uppercase",marginBottom:12}}>Preparation Steps</h3>
          {(recipe.steps||[]).map((step,i)=>{
            const timer = timers[i];
            return (
            <div key={i} style={{background:STEP_COLORS[i%STEP_COLORS.length]+"0a",border:"1px solid "+STEP_COLORS[i%STEP_COLORS.length]+"22",borderRadius:12,marginBottom:10,overflow:"hidden"}}>
              <input ref={el=>stepImgRefs.current[i]=el} type="file" accept="image/*" multiple style={{display:"none"}} onChange={e=>uploadStepImg(i,e)}/>
              {getStepImages(step).length > 0 && (
                <div style={{display:"flex",gap:6,padding:"8px 10px 0",overflowX:"auto"}}>
                  {getStepImages(step).map((img, imgIdx) => (
                    <div key={imgIdx} style={{position:"relative",flexShrink:0,background:"rgba(0,0,0,0.25)",borderRadius:8,overflow:"hidden"}}>
                      <img src={img} alt="" style={{maxWidth:200,maxHeight:140,objectFit:"contain",borderRadius:8,display:"block"}}/>
                      <button onClick={()=>deleteStepImg(i,imgIdx)} style={{position:"absolute",top:3,right:3,background:"rgba(180,40,40,0.85)",border:"none",borderRadius:5,color:"#fff",width:20,height:20,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>×</button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{padding:"12px 14px",display:"flex",gap:12,alignItems:"flex-start"}}>
                <div style={{width:26,height:26,borderRadius:"50%",background:STEP_COLORS[i%STEP_COLORS.length],color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:12,flexShrink:0}}>{i+1}</div>
                <div style={{flex:1}}>
                  <div style={{color:"#c8d0dc",fontSize:13,lineHeight:1.5}}>{step.text}</div>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginTop:6,flexWrap:"wrap"}}>
                    {step.timeMin && !timer && (
                      <button onClick={()=>startTimer(i)} style={{background:"rgba(90,173,142,0.15)",border:"1px solid rgba(90,173,142,0.3)",borderRadius:7,color:"#5aad8e",padding:"2px 9px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
                        ▶ {step.timeMin}min
                      </button>
                    )}
                    {timer && (
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{color:timer.remaining>0?"#ffd580":"#5aad8e",fontWeight:700,fontSize:14,fontVariantNumeric:"tabular-nums"}}>{fmtTime(timer.remaining)}</span>
                        <button onClick={()=>resetTimer(i)} style={{background:"rgba(200,60,60,0.15)",border:"1px solid rgba(200,60,60,0.3)",borderRadius:7,color:"#f08080",padding:"2px 8px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>↺</button>
                      </div>
                    )}
                    <button onClick={()=>stepImgRefs.current[i]?.click()}
                      style={{background:"rgba(90,143,212,0.15)",border:"1px solid rgba(90,143,212,0.3)",borderRadius:7,color:"#7ab0f0",padding:"2px 9px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
                      📷 {getStepImages(step).length > 0 ? `+Photo (${getStepImages(step).length})` : "Upload"}
                    </button>
                    <button onClick={()=>genStepImg(i)} disabled={genIdx!==null}
                      style={{background:"rgba(142,90,173,0.2)",border:"1px solid rgba(180,130,255,0.3)",borderRadius:7,color:"#c8a8ff",padding:"2px 9px",fontSize:11,cursor:genIdx===null?"pointer":"not-allowed",fontFamily:"inherit"}}>
                      {genIdx===i ? "Generating..." : "AI Image"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            );
          })}

          {/* Meal Prep Container Layout */}
          {(() => {
            const {protein,grain,veggie} = getContainerSections();
            return (
              <div style={{marginTop:20,marginBottom:16}}>
                <h3 style={{color:"#c8d0dc",fontSize:13,fontWeight:700,letterSpacing:.8,textTransform:"uppercase",marginBottom:10}}>📦 Meal Prep Container Layout</h3>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,borderRadius:12,overflow:"hidden",border:"1px solid rgba(255,255,255,0.08)"}}>
                  {[["Protein","#5aad8e",protein],["Grain","#e2d9c8",grain],["Veggies","#d4875a",veggie]].map(([label,color,items])=>(
                    <div key={label} style={{background:color+"15",padding:"10px 12px",minHeight:80}}>
                      <div style={{color,fontWeight:700,fontSize:11,marginBottom:6,textTransform:"uppercase"}}>{label}</div>
                      {items.length===0
                        ? <div style={{color:"#4a5a70",fontSize:11}}>—</div>
                        : items.map((ing,i)=><div key={i} style={{color:"#c8d0dc",fontSize:11,marginBottom:3}}>{ing.name} <span style={{color:"#6a7a90"}}>{scaleAmt(ing.amount,r)} {ing.unit}</span></div>)
                      }
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Actions */}
          <div style={{display:"flex",gap:10,marginTop:16,flexWrap:"wrap"}}>
            {onRate && <button onClick={()=>onRate(recipe)} style={{...GB,flex:1}}>⭐ Rate</button>}
            {onEdit && <button onClick={onEdit} style={{...GB,flex:1,background:"rgba(90,143,212,0.15)",color:"#5a8fd4"}}>✏️ Edit</button>}
            {onMarkCooked && <button onClick={()=>{onMarkCooked(recipe);alert("✅ Marked as cooked! Streak updated.");}} style={{...GB,flex:1,background:"rgba(90,173,142,0.2)",color:"#5aad8e"}}>🍳 Mark Cooked</button>}
            <button onClick={()=>{
              const mins = parseInt(prompt("Remind me in how many minutes?","30"));
              if (!mins||isNaN(mins)) return;
              if (Notification.permission==="default") Notification.requestPermission();
              setTimeout(()=>{
                try { new Notification("⏰ Time to cook!",{body:"Start cooking: "+recipe.title,icon:"/logo.svg"}); }
                catch(e) { alert("⏰ Time to start cooking: "+recipe.title); }
              }, mins*60*1000);
              alert("⏰ Reminder set for "+mins+" minutes from now!");
            }} style={{...GB,flex:1,background:"rgba(192,96,144,0.15)",color:"#c06090"}}>⏰ Remind Me</button>
            {recipe.sourceUrl && (
              <a href={recipe.sourceUrl} target="_blank" rel="noreferrer" style={{...GB,textDecoration:"none",display:"inline-flex",alignItems:"center",gap:6,background:"rgba(90,143,212,0.15)",border:"1px solid rgba(90,143,212,0.3)",color:"#5a8fd4",flex:1,justifyContent:"center"}}>
                📺 Source →
              </a>
            )}
          </div>
        </div>
      </div>
      {cookMode && <CookMode recipe={recipe} onClose={()=>setCookMode(false)}/>}
    </div>
  );
}
function EditRecipeModal({recipe:init, onClose, onSave}) {
  const [data, setData] = useState({...init});
  const mainImgRef = useRef(null);
  const stepImgRefs = useRef({});
  const ingImgRefs = useRef({});
  const ingOverallRef = useRef(null);
  const [imgUrlInput, setImgUrlInput] = useState("");

  const set = (k,v) => setData(d=>({...d,[k]:v}));
  const setIng = (i,k,v) => setData(d=>{const a=[...d.ingredients];a[i]={...a[i],[k]:v};return{...d,ingredients:a};});
  const setStep = (i,k,v) => setData(d=>{const a=[...d.steps];a[i]={...a[i],[k]:v};return{...d,steps:a};});
  const addIng = () => setData(d=>({...d,ingredients:[...d.ingredients,{name:"",amount:1,unit:""}]}));
  const removeIng = i => setData(d=>({...d,ingredients:d.ingredients.filter((_,j)=>j!==i)}));
  const addStep = () => setData(d=>({...d,steps:[...d.steps,{text:"",timeMin:5,imagePrompt:""}]}));
  const removeStep = i => setData(d=>({...d,steps:d.steps.filter((_,j)=>j!==i)}));

  const uploadImg = (e, cb) => { const f=e.target.files?.[0]; if(!f) return; const r=new FileReader(); r.onload=ev=>cb(ev.target.result); r.readAsDataURL(f); };

  return (
    <div className="modal-wrap" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:1100,display:"flex",alignItems:"center",justifyContent:"center",padding:16,overflowY:"auto"}}>
      <div className="modal-inner" style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised)",borderRadius:20,maxWidth:700,width:"100%",maxHeight:"94vh",overflowY:"auto",padding:24}}>

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h2 style={{color:"var(--text)",fontFamily:"'Playfair Display',serif",margin:0}}>✏️ Edit Recipe</h2>
          <button onClick={onClose} style={{...GB,padding:"4px 10px",fontSize:18}}>×</button>
        </div>

        {/* Main image */}
        <div style={{marginBottom:16}}>
          <div style={{color:"var(--text-sub)",fontSize:11,fontWeight:700,marginBottom:8,textTransform:"uppercase"}}>📷 Recipe Photo</div>
          <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
            {data.image && <img src={data.image} alt="" style={{width:80,height:80,borderRadius:10,objectFit:"cover"}} onError={e=>e.target.style.display='none'}/>}
            <input ref={mainImgRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>uploadImg(e,url=>set("image",url))}/>
            <button onClick={()=>mainImgRef.current?.click()} style={{...GB,padding:"7px 14px"}}>📁 Upload Photo</button>
            <input value={imgUrlInput} onChange={e=>setImgUrlInput(e.target.value)} placeholder="Or paste image URL…"
              style={{...IS,flex:1,minWidth:150,height:34,padding:"0 10px",fontSize:12}}/>
            <button onClick={()=>{if(imgUrlInput.trim()){set("image",imgUrlInput.trim());setImgUrlInput("");}}} style={{...GB,padding:"7px 10px",fontSize:12}}>Use</button>
          </div>
        </div>

        {/* Basic info */}
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:10,marginBottom:12}}>
          <div>
            <div style={{color:"var(--text-muted)",fontSize:10,fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>Title</div>
            <input value={data.title} onChange={e=>set("title",e.target.value)} style={IS}/>
          </div>
          <div>
            <div style={{color:"var(--text-muted)",fontSize:10,fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>Category</div>
            <select value={data.category} onChange={e=>set("category",e.target.value)} style={IS}>
              {["breakfast","lunch","dessert","drink"].map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:12}}>
          {[["prepTime","Prep (min)"],["cookTime","Cook (min)"],["servings","Servings"]].map(([k,l])=>(
            <div key={k}>
              <div style={{color:"var(--text-muted)",fontSize:10,fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>{l}</div>
              <input type="number" value={data[k]||""} onChange={e=>set(k,+e.target.value)} style={IS}/>
            </div>
          ))}
          <div>
            <div style={{color:"var(--text-muted)",fontSize:10,fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>Difficulty</div>
            <select value={data.difficulty||"beginner"} onChange={e=>set("difficulty",e.target.value)} style={IS}>
              {["beginner","intermediate","advanced"].map(d=><option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>

        {/* Spice level */}
        <div style={{marginBottom:12}}>
          <div style={{color:"var(--text-muted)",fontSize:10,fontWeight:700,marginBottom:6,textTransform:"uppercase"}}>🌶 Spice Level</div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {[0,1,2,3,4,5].map(lvl=>(
              <button key={lvl} onClick={()=>set("spiceLevel",lvl)}
                style={{...GB,padding:"5px 10px",fontSize:12,background:(data.spiceLevel||0)===lvl?"var(--accent)":"var(--bg-card)",color:(data.spiceLevel||0)===lvl?"#fff":"var(--text-sub)",boxShadow:(data.spiceLevel||0)===lvl?"var(--nm-inset)":"var(--nm-raised-sm)"}}>
                {lvl===0?"⚪ None":"🌶".repeat(lvl)+" "+SPICE_LABELS[lvl]}
              </button>
            ))}
          </div>
        </div>

        {/* Cuisine */}
        <div style={{marginBottom:12}}>
          <div style={{color:"var(--text-muted)",fontSize:10,fontWeight:700,marginBottom:6,textTransform:"uppercase"}}>🌍 Cuisine</div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {[null,...CUISINES].map(c=>(
              <button key={c||"none"} onClick={()=>set("cuisine",c)}
                style={{...GB,padding:"4px 10px",fontSize:12,background:(data.cuisine||null)===c?(CUISINE_COLORS[c]||"var(--accent)"):"var(--bg-card)",color:(data.cuisine||null)===c?"#fff":"var(--text-sub)",boxShadow:(data.cuisine||null)===c?"var(--nm-inset)":"var(--nm-raised-sm)"}}>
                {c||"None"}
              </button>
            ))}
          </div>
        </div>

        {/* Nutrition */}
        <div style={{marginBottom:12}}>
          <div style={{color:"var(--text-muted)",fontSize:10,fontWeight:700,marginBottom:6,textTransform:"uppercase"}}>Nutrition (per serving)</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
            {[["calories","🔥 Cal"],["protein","💪 Protein"],["carbs","🌾 Carbs"],["fat","🥑 Fat"]].map(([k,l])=>(
              <div key={k}>
                <div style={{color:"var(--text-muted)",fontSize:10,marginBottom:3}}>{l}</div>
                <input type="number" value={(data.nutrition||{})[k]||""} onChange={e=>set("nutrition",{...(data.nutrition||{}),[k]:+e.target.value})} style={IS}/>
              </div>
            ))}
          </div>
        </div>

        {/* Tags */}
        <div style={{marginBottom:14}}>
          <div style={{color:"var(--text-muted)",fontSize:10,fontWeight:700,marginBottom:6,textTransform:"uppercase"}}>Tags</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
            {ALL_TAGS.map(t=>{const on=(data.tags||[]).includes(t);return(
              <button key={t} onClick={()=>set("tags",on?data.tags.filter(x=>x!==t):[...(data.tags||[]),t])}
                style={{...CB,boxShadow:on?"var(--nm-inset)":"var(--nm-raised-sm)",color:on?(ALL_TAG_COLORS[t]||"var(--accent)"):"var(--text-sub)",fontSize:11}}>
                {on?"✓ ":""}{t}
              </button>
            );})}
          </div>
        </div>

        {/* Goals */}
        <div style={{marginBottom:14}}>
          <div style={{color:"var(--text-muted)",fontSize:10,fontWeight:700,marginBottom:6,textTransform:"uppercase"}}>🎯 Goals</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
            {GOALS.map(g=>{const on=(data.goal||[]).map(x=>(x||"").toLowerCase()).includes(g);return(
              <button key={g} onClick={()=>set("goal",on?(data.goal||[]).filter(x=>(x||"").toLowerCase()!==g):[...(data.goal||[]),g])}
                style={{...CB,boxShadow:on?"var(--nm-inset)":"var(--nm-raised-sm)",color:on?"var(--accent)":"var(--text-sub)",fontSize:11}}>
                {on?"✓ ":""}{g}
              </button>
            );})}
          </div>
        </div>

        {/* Ingredients */}
        <div style={{marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div style={{color:"var(--text-muted)",fontSize:10,fontWeight:700,textTransform:"uppercase"}}>Ingredients</div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>ingOverallRef.current?.click()} style={{...GB,padding:"3px 10px",fontSize:12}}>📷 Overall Photo</button>
              <button onClick={addIng} style={{...GB,padding:"3px 10px",fontSize:12}}>+ Add</button>
            </div>
          </div>
          <input ref={ingOverallRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>uploadImg(e,url=>set("ingredientsImage",url))}/>
          {data.ingredientsImage && (
            <div style={{position:"relative",marginBottom:10,borderRadius:10,overflow:"hidden"}}>
              <img src={data.ingredientsImage} alt="All ingredients" style={{width:"100%",height:100,objectFit:"cover"}}/>
              <div style={{position:"absolute",top:5,right:5,display:"flex",gap:4}}>
                <button onClick={()=>ingOverallRef.current?.click()} style={{background:"rgba(0,0,0,0.65)",border:"none",borderRadius:7,color:"#fff",padding:"3px 8px",fontSize:11,cursor:"pointer"}}>📷 Change</button>
                <button onClick={()=>set("ingredientsImage",null)} style={{background:"rgba(180,40,40,0.75)",border:"none",borderRadius:7,color:"#fff",padding:"3px 8px",fontSize:11,cursor:"pointer"}}>🗑</button>
              </div>
            </div>
          )}
          {(data.ingredients||[]).map((ing,i)=>(
            <div key={i} style={{marginBottom:8}}>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <input ref={el=>ingImgRefs.current[i]=el} type="file" accept="image/*" style={{display:"none"}} onChange={e=>uploadImg(e,url=>setIng(i,"image",url))}/>
                {ing.image
                  ? <img src={ing.image} alt="" style={{width:36,height:36,borderRadius:8,objectFit:"cover",flexShrink:0,cursor:"pointer"}} onClick={()=>ingImgRefs.current[i]?.click()} title="Change photo"/>
                  : <button onClick={()=>ingImgRefs.current[i]?.click()} style={{width:36,height:36,borderRadius:8,border:"1px dashed var(--border)",background:"var(--nm-input-bg)",color:"var(--text-muted)",fontSize:14,cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}} title="Add ingredient photo">📷</button>
                }
                <input value={ing.name} onChange={e=>setIng(i,"name",e.target.value)} placeholder="Ingredient" style={{...IS,flex:2}}/>
                <input type="number" value={ing.amount||""} onChange={e=>setIng(i,"amount",+e.target.value)} placeholder="Qty" style={{...IS,flex:1,minWidth:50}}/>
                <input value={ing.unit} onChange={e=>setIng(i,"unit",e.target.value)} placeholder="Unit" style={{...IS,flex:1,minWidth:50}}/>
                <button onClick={()=>removeIng(i)} style={{...GB,padding:"4px 8px",color:"#f08080",fontSize:14,flexShrink:0}}>×</button>
              </div>
            </div>
          ))}
        </div>

        {/* Steps */}
        <div style={{marginBottom:18}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div style={{color:"var(--text-muted)",fontSize:10,fontWeight:700,textTransform:"uppercase"}}>Steps</div>
            <button onClick={addStep} style={{...GB,padding:"3px 10px",fontSize:12}}>+ Add Step</button>
          </div>
          {(data.steps||[]).map((step,i)=>(
            <div key={i} style={{background:"var(--nm-input-bg)",boxShadow:"var(--nm-inset)",borderRadius:12,padding:12,marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <span style={{color:"var(--accent)",fontWeight:700,fontSize:13}}>Step {i+1}</span>
                <button onClick={()=>removeStep(i)} style={{...GB,padding:"2px 8px",color:"#f08080",fontSize:13}}>× Remove</button>
              </div>
              <textarea value={step.text} onChange={e=>setStep(i,"text",e.target.value)} placeholder="Describe this step…"
                style={{...IS,minHeight:60,resize:"vertical",marginBottom:8}}/>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{color:"var(--text-muted)",fontSize:11}}>⏱</span>
                  <input type="number" value={step.timeMin||""} onChange={e=>setStep(i,"timeMin",+e.target.value)} placeholder="Min"
                    style={{...IS,width:60,height:30,padding:"0 8px",fontSize:12}}/>
                  <span style={{color:"var(--text-muted)",fontSize:11}}>min</span>
                </div>
                <input ref={el=>stepImgRefs.current[i]=el} type="file" accept="image/*" multiple style={{display:"none"}}
                  onChange={e=>{Array.from(e.target.files||[]).forEach(f=>{const r=new FileReader();r.onload=ev=>setData(d=>{const a=[...d.steps];const imgs=getStepImages(a[i]);a[i]={...a[i],images:[...imgs,ev.target.result]};return{...d,steps:a};});r.readAsDataURL(f);});e.target.value="";}}/>
                <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
                  {getStepImages(step).map((img,imgIdx)=>(
                    <div key={imgIdx} style={{position:"relative"}}>
                      <img src={img} alt="" style={{width:40,height:40,borderRadius:6,objectFit:"cover",display:"block"}}/>
                      <button onClick={()=>setData(d=>{const a=[...d.steps];const imgs=getStepImages(a[i]).filter((_,j)=>j!==imgIdx);a[i]={...a[i],images:imgs,image:imgs[0]||null};return{...d,steps:a};})}
                        style={{position:"absolute",top:-4,right:-4,width:14,height:14,borderRadius:"50%",background:"#e05a6a",border:"none",color:"#fff",fontSize:9,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>×</button>
                    </div>
                  ))}
                  <button onClick={()=>stepImgRefs.current[i]?.click()} style={{...GB,padding:"4px 10px",fontSize:11}}>📷 {getStepImages(step).length>0?"Add More":"Add Photo"}</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{display:"flex",gap:10}}>
          <button onClick={onClose} style={{...GB,flex:1}}>Cancel</button>
          <button onClick={()=>onSave({...data,totalTime:(data.prepTime||0)+(data.cookTime||0)})}
            style={{flex:2,background:"linear-gradient(135deg,var(--accent2),var(--accent))",border:"none",borderRadius:12,color:"#fff",padding:14,fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>
            💾 Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ADD RECIPE MODAL ─────────────────────────────────────────────────────────
function SmartAddModal({onClose, onAdd}) {
  const [phase, setPhase] = useState("input");
  const [loadingMsg, setLoadingMsg] = useState("Extracting your recipe...");
  const [inputVal, setInputVal] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [imgUrlInput, setImgUrlInput] = useState("");
  const fileRef = useRef(null);
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  const handleError = (e) => {
    if (e.message === "NO_KEY") return "No API key — click ⚙️ in the topbar and add your Anthropic key first.";
    if (e.message === "RATE_LIMIT") return "Rate limit hit — wait 60 seconds and try again.";
    if (e.message === "INVALID_KEY") return "Invalid API key — click ⚙️ and re-enter your Anthropic key.";
    if (e.message === "LOW_CREDITS") return "Your Anthropic API credits are too low. Go to console.anthropic.com → Billing to top up.";
    return null;
  };

  const run = async () => {
    if (!inputVal.trim()) return;
    setLoading(true); setError(null); setPhase("loading");
    setLoadingMsg("Extracting your recipe...");
    try {
      const result = await aiExtractRecipe(inputVal.trim());
      if (!result.image) result.image = makeFoodSVG(result.title, result.category);
      setData({...result, id:Date.now()});
      setPhase("review");
    } catch(e) {
      console.error("Recipe extraction error:", e);
      setError(handleError(e) || "Extraction failed. Try pasting the recipe text directly.");
      setPhase("input");
    }
    setLoading(false);
  };

  const runFromImage = async (file) => {
    if (!file) return;
    setLoading(true); setError(null); setPhase("loading");
    setLoadingMsg("Reading recipe from photo...");
    try {
      const base64DataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const result = await aiExtractRecipeFromImage(base64DataUrl);
      setData({...result, id:Date.now()});
      setPhase("review");
    } catch(e) {
      console.error("Image extraction error:", e);
      setError(handleError(e) || "Could not read recipe from image. Try a clearer photo or paste the recipe text instead.");
      setPhase("input");
    }
    setLoading(false);
  };

  const save = () => { if(data) { onAdd(data); onClose(); } };
  const set = (k,v) => setData(d=>({...d,[k]:v}));

  return (
    <div className="modal-wrap" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,overflowY:"auto"}}>
      <div className="modal-inner" style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised)",border:"1px solid var(--border)",borderRadius:20,maxWidth:680,width:"100%",maxHeight:"92vh",overflowY:"auto",padding:24}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h2 style={{color:"#fff",fontFamily:"'Playfair Display',serif",margin:0}}>Add Recipe</h2>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#6a7a90",cursor:"pointer",fontSize:22}}>×</button>
        </div>

        {phase==="input" && (
          <div>
            {/* Camera / Image scan */}
            <div style={{border:"1px dashed rgba(90,173,142,0.4)",borderRadius:14,padding:"20px 16px",marginBottom:20,textAlign:"center",background:"rgba(90,173,142,0.04)"}}>
              <div style={{fontSize:36,marginBottom:6}}>📷</div>
              <div style={{color:"var(--text-sub)",fontSize:13,fontWeight:600,marginBottom:6}}>Scan a Recipe Photo</div>
              <div style={{color:"var(--text-muted)",fontSize:12,marginBottom:14}}>Point your camera at a recipe card, cookbook, or screenshot — AI reads it automatically</div>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{display:"none"}}
                onChange={e=>{const f=e.target.files?.[0];if(f) runFromImage(f); e.target.value="";}}/>
              <input ref={galleryRef} type="file" accept="image/*" style={{display:"none"}}
                onChange={e=>{const f=e.target.files?.[0];if(f) runFromImage(f); e.target.value="";}}/>
              <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
                <button onClick={()=>cameraRef.current?.click()}
                  style={{...GB,padding:"10px 20px",fontSize:13,fontWeight:700,color:"#5aad8e",border:"1px solid rgba(90,173,142,0.35)"}}>
                  📷 Take Photo
                </button>
                <button onClick={()=>galleryRef.current?.click()}
                  style={{...GB,padding:"10px 20px",fontSize:13,fontWeight:700}}>
                  🖼 Upload Image
                </button>
              </div>
            </div>

            {/* Divider */}
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
              <div style={{flex:1,height:1,background:"var(--border)"}}/>
              <span style={{color:"var(--text-muted)",fontSize:12,flexShrink:0}}>or paste a URL / describe a recipe</span>
              <div style={{flex:1,height:1,background:"var(--border)"}}/>
            </div>

            {error && <div style={{background:"rgba(192,80,80,0.15)",border:"1px solid rgba(192,80,80,0.3)",borderRadius:10,padding:"10px 14px",color:"#f08080",fontSize:13,marginBottom:14}}>{error}</div>}
            <textarea value={inputVal} onChange={e=>setInputVal(e.target.value)}
              style={{...IS,minHeight:90,resize:"vertical",marginBottom:14}}
              placeholder="https://www.tiktok.com/... or paste recipe text here..."/>
            <button onClick={run} style={{width:"100%",background:"linear-gradient(135deg,#3a7d5e,#5aad8e)",border:"none",borderRadius:12,color:"#fff",padding:14,fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>
              Extract Recipe with AI
            </button>
          </div>
        )}

        {phase==="loading" && (
          <div style={{textAlign:"center",padding:"48px 0"}}>
            <div style={{fontSize:40,marginBottom:16,animation:"spin 2s linear infinite",display:"inline-block"}}>⏳</div>
            <div style={{color:"#5aad8e",fontSize:16,fontWeight:600}}>{loadingMsg}</div>
            <div style={{color:"#6a7a90",fontSize:13,marginTop:8}}>{loadingMsg.includes("photo") ? "Analyzing image → extracting ingredients & steps" : "Fetching page → reading content → building recipe"}</div>
          </div>
        )}

        {phase==="review" && data && (
          <div>
            <div style={{background:"rgba(58,125,94,0.1)",border:"1px solid rgba(58,125,94,0.25)",borderRadius:12,padding:"14px 16px",marginBottom:14,display:"flex",gap:14,alignItems:"center"}}>
              {data.image && <img src={data.image} alt="" style={{width:80,height:80,borderRadius:10,objectFit:"cover",flexShrink:0}} onError={e=>e.target.style.display='none'}/>}
              <div>
                <div style={{color:"#5aad8e",fontSize:11,fontWeight:700,marginBottom:4}}>✅ RECIPE EXTRACTED</div>
                <div style={{color:"#fff",fontWeight:700,fontFamily:"'Playfair Display',serif",fontSize:16}}>{data.title}</div>
                <NutriBadge n={data.nutrition}/>
              </div>
            </div>

            {/* Image upload */}
            <div style={{marginBottom:14,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,padding:"12px 14px"}}>
              <div style={{color:"#6a7a90",fontSize:10,fontWeight:700,marginBottom:8,textTransform:"uppercase"}}>📷 Recipe Image (optional)</div>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                {data.image && <img src={data.image} alt="" style={{width:56,height:56,borderRadius:8,objectFit:"cover",flexShrink:0}} onError={e=>e.target.style.display='none'}/>}
                <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}}
                  onChange={e=>{const f=e.target.files?.[0];if(f){const r=new FileReader();r.onload=ev=>setData(d=>({...d,image:ev.target.result}));r.readAsDataURL(f);}}}/>
                <button onClick={()=>fileRef.current?.click()} style={{...GB,padding:"6px 12px",fontSize:12}}>📁 Upload Photo</button>
                <input value={imgUrlInput} onChange={e=>setImgUrlInput(e.target.value)}
                  placeholder="Or paste image URL..."
                  style={{...IS,flex:1,minWidth:160,height:34,padding:"0 10px",fontSize:12}}/>
                <button onClick={()=>{if(imgUrlInput.trim()){setData(d=>({...d,image:imgUrlInput.trim()}));setImgUrlInput("");}}}
                  style={{...GB,padding:"6px 10px",fontSize:12}}>Use</button>
              </div>
            </div>

            {/* Editable fields */}
            <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:10,marginBottom:12}}>
              <div>
                <div style={{color:"#6a7a90",fontSize:10,fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>Title</div>
                <input value={data.title} onChange={e=>set("title",e.target.value)} style={IS}/>
              </div>
              <div>
                <div style={{color:"#6a7a90",fontSize:10,fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>Category</div>
                <select value={data.category} onChange={e=>set("category",e.target.value)} style={IS}>
                  {["breakfast","lunch","dessert","drink"].map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
              {[["prepTime","Prep (min)"],["cookTime","Cook (min)"],["servings","Servings"]].map(([k,l])=>(
                <div key={k}>
                  <div style={{color:"#6a7a90",fontSize:10,fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>{l}</div>
                  <input type="number" value={data[k]||""} onChange={e=>set(k,+e.target.value)} style={IS}/>
                </div>
              ))}
            </div>

            <div style={{marginBottom:12}}>
              <div style={{color:"#6a7a90",fontSize:10,fontWeight:700,marginBottom:6,textTransform:"uppercase"}}>Tags</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {ALL_TAGS.map(t=>{const on=(data.tags||[]).includes(t);return(
                  <button key={t} onClick={()=>set("tags",on?data.tags.filter(x=>x!==t):[...(data.tags||[]),t])}
                    style={{...CB,background:on?(ALL_TAG_COLORS[t]||"#3a7d5e")+"28":"rgba(255,255,255,0.04)",color:on?(ALL_TAG_COLORS[t]||"#5aad8e"):"#6a7a90",border:on?"1px solid "+(ALL_TAG_COLORS[t]||"#3a7d5e"):"1px solid rgba(255,255,255,0.08)"}}>
                    {on?"✓ ":""}{t}
                  </button>
                );})}
              </div>
            </div>

            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>{setPhase("input");setData(null);}} style={{...GB,flex:1}}>← Try Again</button>
              <button onClick={save} style={{flex:2,background:"linear-gradient(135deg,#3a7d5e,#5aad8e)",border:"none",borderRadius:12,color:"#fff",padding:14,fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>
                💾 Save Recipe
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MIX & MATCH ─────────────────────────────────────────────────────────────
function MixMatch({recipes, onAddToMealPlan, onSaveAsRecipe}) {
  const [sel, setSel] = useState({protein:null,grain:null,side:null});
  const [portions, setPortions] = useState(1);
  const [mealsPerDay, setMealsPerDay] = useState(1);
  const [comboName, setComboName] = useState("");
  const [saved, setSaved] = useState(false);

  const proteins = recipes.filter(r=>(r.type||{}).protein);
  const grains = recipes.filter(r=>(r.type||{}).grain);
  const sides = recipes.filter(r=>(r.type||{}).side||r.category==="dessert"||r.category==="drink");

  const combined = Object.values(sel).filter(Boolean);
  const totN = combined.reduce((a,r)=>({calories:a.calories+Math.round(r.nutrition.calories*portions),protein:a.protein+Math.round(r.nutrition.protein*portions),carbs:a.carbs+Math.round(r.nutrition.carbs*portions),fat:a.fat+Math.round(r.nutrition.fat*portions)}),{calories:0,protein:0,carbs:0,fat:0});
  const dailyN = {calories:totN.calories*mealsPerDay,protein:totN.protein*mealsPerDay,carbs:totN.carbs*mealsPerDay,fat:totN.fat*mealsPerDay};
  const totTime = combined.reduce((a,r)=>a+(r.totalTime||(r.prepTime||0)+(r.cookTime||0)),0);
  const allAllergens = [...new Set(combined.flatMap(r=>r.allergens||[]))];

  const handleSave = () => {
    if (!combined.length) return;
    const name = comboName.trim() || combined.map(r=>r.title).join(" + ");
    onAddToMealPlan({type:"combo",name,recipes:combined,portions,mealsPerDay,nutrition:totN,dailyNutrition:dailyN,time:totTime,allergens:allAllergens,id:Date.now()});
    setSaved(true); setTimeout(()=>setSaved(false),2500);
  };

  const handleSaveAsRecipe = () => {
    if (!combined.length || !onSaveAsRecipe) return;
    const name = comboName.trim() || combined.map(r=>r.title).join(" + ");
    const mergedIng = [];
    const seen = {};
    combined.forEach(r=>(r.ingredients||[]).forEach(ing=>{
      const k = ing.name.toLowerCase();
      if (seen[k]) seen[k].amount += ing.amount*portions;
      else { const ni={...ing,amount:ing.amount*portions}; mergedIng.push(ni); seen[k]=ni; }
    }));
    onSaveAsRecipe({id:Date.now(),title:name,category:"lunch",image:null,tags:[...new Set(combined.flatMap(r=>r.tags||[]))],allergens:allAllergens,equipment:[...new Set(combined.flatMap(r=>r.equipment||[]))],type:{protein:combined.some(r=>(r.type||{}).protein),grain:combined.some(r=>(r.type||{}).grain),side:false},nutrition:totN,goal:[...new Set(combined.flatMap(r=>r.goal||[]))],ingredients:mergedIng,steps:combined.flatMap((r,ri)=>(r.steps||[]).map(s=>({...s,text:"["+r.title+"] "+s.text}))),servings:portions,prepTime:combined.reduce((a,r)=>a+(r.prepTime||0),0),cookTime:combined.reduce((a,r)=>a+(r.cookTime||0),0),totalTime:totTime,difficulty:"intermediate",healthBenefits:""});
    setSaved(true); setTimeout(()=>setSaved(false),2500);
  };

  const Slot = ({label,key2,options,fallback}) => (
    <div style={{flex:1,minWidth:160}}>
      <div style={{color:"#8a9bb0",fontSize:10,fontWeight:700,letterSpacing:1,marginBottom:8,textTransform:"uppercase"}}>{label}</div>
      {!options.length
        ? <div style={{color:"#5a6a7a",fontSize:12,padding:12,background:"rgba(255,255,255,0.03)",borderRadius:10,textAlign:"center",border:"1px dashed rgba(255,255,255,0.08)"}}>{fallback}</div>
        : options.map(r=>(
          <button key={r.id} onClick={()=>setSel(s=>({...s,[key2]:(s[key2]&&s[key2].id===r.id)?null:r}))}
            style={{width:"100%",background:(sel[key2]&&sel[key2].id===r.id)?"rgba(58,125,94,0.2)":"rgba(255,255,255,0.03)",border:"1px solid "+((sel[key2]&&sel[key2].id===r.id)?"#3a7d5e":"rgba(255,255,255,0.07)"),borderRadius:10,padding:"8px 10px",cursor:"pointer",display:"flex",alignItems:"center",gap:9,marginBottom:5,fontFamily:"inherit"}}>
            <SmartImage recipe={r} style={{width:36,height:36,borderRadius:7,flexShrink:0}}/>
            <div style={{textAlign:"left",flex:1,minWidth:0}}>
              <div style={{color:"#e2d9c8",fontSize:12,fontWeight:600,lineHeight:1.3}}>{r.title}</div>
              <div style={{color:"#6a7a90",fontSize:11}}>{r.nutrition.calories}kcal · {r.totalTime||(r.prepTime||0)+(r.cookTime||0)}min</div>
            </div>
            {sel[key2]&&sel[key2].id===r.id&&<span style={{color:"#5aad8e"}}>✓</span>}
          </button>
        ))
      }
    </div>
  );

  return (
    <div>
      <h2 style={{color:"#fff",fontFamily:"'Playfair Display',serif",marginBottom:4}}>Mix & Match</h2>
      <p style={{color:"#8a9bb0",fontSize:13,marginBottom:18}}>Build a custom meal — adjust portions, then save to your plan or as a new recipe.</p>

      <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:14,padding:"14px 18px",marginBottom:18,display:"flex",gap:24,flexWrap:"wrap",alignItems:"center"}}>
        {[["Portions/person",portions,setPortions,1,10],["Meals/day",mealsPerDay,setMealsPerDay,1,6]].map(([lbl,val,fn,mn,mx])=>(
          <div key={lbl} style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{color:"#c8d0dc",fontSize:13,whiteSpace:"nowrap"}}>{lbl}</span>
            <button onClick={()=>fn(v=>Math.max(mn,v-1))} style={{...GB,padding:"3px 11px"}}>−</button>
            <span style={{color:"#fff",fontWeight:700,fontSize:20,minWidth:24,textAlign:"center"}}>{val}</span>
            <button onClick={()=>fn(v=>Math.min(mx,v+1))} style={{...GB,padding:"3px 11px"}}>+</button>
          </div>
        ))}
      </div>

      <div style={{display:"flex",gap:14,marginBottom:20,flexWrap:"wrap"}}>
        <Slot label="Protein" key2="protein" options={proteins.length?proteins:recipes.slice(0,4)} fallback="No protein recipes yet"/>
        <Slot label="Grain / Base" key2="grain" options={grains.length?grains:recipes.slice(0,4)} fallback="No grain recipes yet"/>
        <Slot label="Side / Drink" key2="side" options={sides.length?sides:recipes.slice(0,4)} fallback="No side recipes yet"/>
      </div>

      {combined.length>0 && (
        <div style={{background:"linear-gradient(135deg,rgba(58,125,94,0.1),rgba(90,143,212,0.06))",border:"1px solid rgba(58,125,94,0.28)",borderRadius:16,padding:20}}>
          <div style={{color:"#5aad8e",fontWeight:700,fontSize:11,marginBottom:10,letterSpacing:.8}}>✨ COMBO · {portions} portion{portions!==1?"s":""}/person · {mealsPerDay}x/day · <span style={{color:"#c8a8ff"}}>{portions*mealsPerDay} total serving{portions*mealsPerDay!==1?"s":""}/day</span></div>
          <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:14}}>
            {combined.map(r=><span key={r.id} style={{background:"rgba(58,125,94,0.2)",color:"#5aad8e",border:"1px solid rgba(58,125,94,0.38)",borderRadius:20,padding:"4px 12px",fontSize:13,fontWeight:600}}>{r.title}</span>)}
          </div>
          <div style={{marginBottom:10}}>
            <div style={{color:"#8a9bb0",fontSize:11,fontWeight:700,marginBottom:5}}>PER SERVING ({portions}×)</div>
            <NutriBadge n={totN}/>
          </div>
          {mealsPerDay>1 && <div style={{marginBottom:12}}>
            <div style={{color:"#8a9bb0",fontSize:11,fontWeight:700,marginBottom:5}}>DAILY TOTAL ({mealsPerDay} meals)</div>
            <NutriBadge n={dailyN}/>
          </div>}
          {totTime>0 && <div style={{color:"#5a8fd4",fontSize:12,marginBottom:14}}>⏱ ~{totTime}min cook time</div>}
          {allAllergens.length>0 && <div style={{color:"#f08080",fontSize:12,marginBottom:14}}>⚠ {allAllergens.join(", ")}</div>}
          <div style={{display:"flex",gap:9,flexWrap:"wrap"}}>
            <input value={comboName} onChange={e=>setComboName(e.target.value)} placeholder="Name this combo (optional)..."
              style={{...IS,flex:1,minWidth:160,fontSize:13,padding:"8px 12px"}}/>
            <button onClick={handleSave} style={{background:saved?"rgba(58,125,94,0.55)":"linear-gradient(135deg,#3a7d5e,#5aad8e)",border:"none",borderRadius:11,color:"#fff",padding:"10px 16px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
              {saved?"✓ Saved!":"📅 Add to Plan"}
            </button>
            {onSaveAsRecipe && <button onClick={handleSaveAsRecipe} style={{...GB,whiteSpace:"nowrap"}}>💾 Save as Recipe</button>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MEAL PREP OPTIMIZER ─────────────────────────────────────────────────────
function MealPrepOptimizer({recipes, onAddToMealPlan}) {
  const [selected, setSelected] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const toggle = id => setSelected(p => p.includes(id) ? p.filter(x=>x!==id) : [...p,id]);

  const optimize = async () => {
    const sel = recipes.filter(r=>selected.includes(r.id));
    if (sel.length < 2) return;
    setLoading(true); setResult(null);
    try {
      const list = sel.map((r,i)=>`${i+1}. ${r.title} (${r.totalTime||((r.prepTime||0)+(r.cookTime||0))}min, steps: ${(r.steps||[]).map(s=>s.text.slice(0,40)).join("; ")})`).join("\n");
      const text = await anthropicCall({max_tokens:1000, messages:[{role:"user",content:"You are a meal prep expert. Given these recipes:\n"+list+"\n\nCreate an optimized parallel cooking workflow. List steps in order of execution. Mark steps that can happen simultaneously with [PARALLEL]. Format as numbered steps. Estimate total time saved."}]});
      setResult(text);
    } catch(e){}
    setLoading(false);
  };

  const PREP_TIPS = [
    "Batch cook grains (rice, quinoa) all at once — they keep 5 days in the fridge.",
    "Use a sheet pan for proteins while stovetop handles veggies simultaneously.",
    "Pre-chop and store vegetables in airtight containers for 3-4 days.",
  ];

  return (
    <div>
      <h2 style={{color:"#fff",fontFamily:"'Playfair Display',serif",marginBottom:6}}>⚡ Meal Prep Optimizer</h2>
      <p style={{color:"#8a9bb0",fontSize:13,marginBottom:20}}>Select 2+ recipes and get an AI-optimized parallel cooking workflow.</p>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:10,marginBottom:20}}>
        {recipes.map(r=>(
          <button key={r.id} onClick={()=>toggle(r.id)}
            style={{background:selected.includes(r.id)?"rgba(58,125,94,0.2)":"rgba(255,255,255,0.03)",border:"1px solid "+(selected.includes(r.id)?"#3a7d5e":"rgba(255,255,255,0.08)"),borderRadius:12,padding:"10px 14px",cursor:"pointer",textAlign:"left",fontFamily:"inherit",display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:18}}>{selected.includes(r.id)?"✅":"⬜"}</span>
            <div>
              <div style={{color:"#e2d9c8",fontWeight:600,fontSize:13}}>{r.title}</div>
              <div style={{color:"#6a7a90",fontSize:11,marginTop:2}}>{r.totalTime||((r.prepTime||0)+(r.cookTime||0))}min</div>
            </div>
          </button>
        ))}
      </div>

      <button onClick={optimize} disabled={selected.length<2||loading}
        style={{background:selected.length>=2&&!loading?"linear-gradient(135deg,#5a8fd4,#3a5fa0)":"rgba(255,255,255,0.05)",border:"none",borderRadius:12,color:selected.length>=2&&!loading?"#fff":"#5a6a7a",padding:"12px 24px",fontWeight:700,fontSize:14,cursor:selected.length>=2&&!loading?"pointer":"not-allowed",fontFamily:"inherit",marginBottom:20}}>
        {loading?"⏳ Optimizing...":"⚡ Optimize Workflow"}
      </button>

      {result && (
        <div style={{background:"rgba(90,143,212,0.07)",border:"1px solid rgba(90,143,212,0.2)",borderRadius:14,padding:18,marginBottom:20}}>
          <div style={{color:"#5a8fd4",fontWeight:700,fontSize:13,marginBottom:12}}>⚡ Optimized Workflow</div>
          {result.split("\n").filter(l=>l.trim()).map((line,i)=>{
            const isParallel = line.includes("[PARALLEL]");
            return (
              <div key={i} style={{display:"flex",gap:10,marginBottom:8,alignItems:"flex-start"}}>
                <div style={{color:"#e2d9c8",fontSize:13,lineHeight:1.5,flex:1,background:isParallel?"rgba(90,143,212,0.12)":"transparent",borderRadius:isParallel?7:0,padding:isParallel?"4px 8px":"0",border:isParallel?"1px solid rgba(90,143,212,0.3)":"none"}}>
                  {line}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{background:"rgba(90,173,142,0.07)",border:"1px solid rgba(90,173,142,0.2)",borderRadius:14,padding:18}}>
        <div style={{color:"#5aad8e",fontWeight:700,fontSize:13,marginBottom:10}}>🥘 Prep Tips</div>
        {PREP_TIPS.map((tip,i)=>(
          <div key={i} style={{display:"flex",gap:10,marginBottom:8,alignItems:"flex-start"}}>
            <span style={{color:"#5aad8e",flexShrink:0}}>•</span>
            <div style={{color:"#c8d0dc",fontSize:13,lineHeight:1.5}}>{tip}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SHOPPING LIST ───────────────────────────────────────────────────────────
function ShoppingList({mealPlanItems, recipes, spends, onLogSpend, weeklyBudget}) {
  const [people, setPeople] = useState(1);
  const [weeks, setWeeks] = useState(1);
  const [checked, setChecked] = useState({});
  const [manualItems, setManualItems] = useState([]);
  const [newItem, setNewItem] = useState("");
  const [bySection, setBySection] = useState(true);
  const [spendInput, setSpendInput] = useState("");
  const [spendNote, setSpendNote] = useState("");
  const [showSpendLog, setShowSpendLog] = useState(false);

  const SECTIONS = [
    {key:"produce",label:"🥦 Produce",rx:/onion|garlic|tomato|pepper|spinach|carrot|celery|broccoli|mushroom|zucchini|avocado|lemon|lime|berry|apple|banana|herb|basil|cilantro|parsley|ginger|cucumber|lettuce|kale/,color:"#5aad8e"},
    {key:"meat",label:"🥩 Meat & Fish",rx:/chicken|beef|salmon|tuna|fish|shrimp|egg|turkey|pork|lamb|meat|steak|mince|prawn/,color:"#d4875a"},
    {key:"dairy",label:"🧀 Dairy",rx:/milk|cheese|yogurt|butter|cream|cheddar|mozzarella|feta|parmesan|whey|kefir/,color:"#ffd580"},
    {key:"grains",label:"🌾 Grains & Pantry",rx:/rice|oat|quinoa|pasta|flour|bread|noodle|cereal|tortilla|oil|sauce|vinegar|soy|salt|spice|cumin|paprika|oregano|sugar|honey|nut|almond|seed|chia|maple|vanilla|cocoa|chocolate|coconut/,color:"#c8a8ff"},
    {key:"other",label:"🛒 Other",rx:/./,color:"#8a9bb0"},
  ];

  const getSection = name => {
    const n = (name||"").toLowerCase();
    return SECTIONS.find(s=>s.key!=="other"&&s.rx.test(n))?.key || "other";
  };

  // Build list live from mealPlanItems
  const autoList = useMemo(() => {
    const m = {};
    mealPlanItems.forEach(item=>{
      const recs = item.type==="combo" ? (item.recipes||[]) : [item.recipe].filter(Boolean);
      const scale = (item.portions||1) * people * weeks;
      recs.forEach(r=>(r.ingredients||[]).forEach(ing=>{
        const k = ing.name.toLowerCase();
        if (m[k]) m[k].amount += (ing.amount||0)*scale;
        else m[k] = {name:ing.name, amount:(ing.amount||0)*scale, unit:ing.unit||"", section:getSection(ing.name)};
      }));
    });
    return Object.values(m).sort((a,b)=>a.name.localeCompare(b.name));
  }, [mealPlanItems, people, weeks]);

  const allItems = [
    ...autoList,
    ...manualItems.map(m=>({...m, section:getSection(m.name), manual:true}))
  ];

  const toggle = key => setChecked(c=>({...c,[key]:!c[key]}));
  const addManual = () => {
    if (!newItem.trim()) return;
    setManualItems(p=>[...p,{name:newItem.trim(),amount:1,unit:"",id:Date.now()}]);
    setNewItem("");
  };
  const removeManual = id => setManualItems(p=>p.filter(x=>x.id!==id));
  const clearChecked = () => setChecked({});

  const unchecked = allItems.filter(x=>!checked[x.name.toLowerCase()]);
  const checkedItems = allItems.filter(x=>checked[x.name.toLowerCase()]);

  const exportList = () => {
    const txt = ["🛒 Shopping List","",
      ...unchecked.map(i=>`☐ ${i.name}${i.amount>0?` — ${Math.ceil(i.amount*10)/10} ${i.unit}`:""}`),
      checkedItems.length ? "\n✅ Got it:" : "",
      ...checkedItems.map(i=>`✅ ${i.name}`)
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([txt],{type:"text/plain"}));
    a.download = "shopping-list.txt"; a.click();
  };

  const logSpend = () => {
    const amt = parseFloat(spendInput);
    if (!amt || isNaN(amt)) return;
    onLogSpend?.({id:Date.now(), amount:amt, note:spendNote.trim()||"Shopping trip", date:new Date().toISOString()});
    setSpendInput(""); setSpendNote(""); setShowSpendLog(false);
  };

  const renderItems = items => items.map(item=>{
    const key = item.name.toLowerCase();
    const done = !!checked[key];
    const emoji = getItemEmoji(item.name);
    return (
      <div key={key+(item.manual?"_m":"")} onClick={()=>toggle(key)}
        style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:10,cursor:"pointer",marginBottom:4,background:done?"var(--nm-input-bg)":"var(--bg-card)",boxShadow:done?"var(--nm-inset)":"var(--nm-raised-sm)",opacity:done?0.5:1,transition:"all .15s"}}>
        <div style={{width:20,height:20,borderRadius:6,border:"2px solid "+(done?"var(--accent)":"var(--border)"),background:done?"var(--accent)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:12,color:"#fff",transition:"all .15s"}}>
          {done?"✓":""}
        </div>
        <span style={{fontSize:16,flexShrink:0}}>{emoji}</span>
        <span style={{flex:1,color:"var(--text)",fontSize:13,textDecoration:done?"line-through":"none"}}>{item.name}</span>
        {item.amount>0 && <span style={{color:"var(--accent)",fontWeight:600,fontSize:12}}>{Math.ceil(item.amount*10)/10} {item.unit}</span>}
        {item.manual && <button onClick={e=>{e.stopPropagation();removeManual(item.id);}} style={{background:"none",border:"none",color:"#f08080",fontSize:14,cursor:"pointer",padding:"0 2px"}}>×</button>}
      </div>
    );
  });

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18,flexWrap:"wrap",gap:10}}>
        <div>
          <h2 style={{color:"var(--text)",fontFamily:"'Playfair Display',serif",margin:"0 0 4px"}}>🛒 Shopping List</h2>
          <p style={{color:"var(--text-sub)",fontSize:13,margin:0}}>{unchecked.length} items remaining · {checkedItems.length} checked off</p>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={()=>setBySection(s=>!s)} style={{...GB,fontSize:12}}>{bySection?"📋 All":"🏪 By Section"}</button>
          {checkedItems.length>0&&<button onClick={clearChecked} style={{...GB,fontSize:12,color:"#f08080"}}>↺ Uncheck all</button>}
          <button onClick={exportList} style={{...GB,fontSize:12}}>📄 Export</button>
        </div>
      </div>

      {/* Settings row */}
      <div style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised)",borderRadius:14,padding:"12px 16px",marginBottom:18,display:"flex",gap:16,flexWrap:"wrap",alignItems:"center"}}>
        {[["👥 People",people,setPeople,1,20],["📅 Weeks",weeks,setWeeks,1,8]].map(([lbl,val,fn,mn,mx])=>(
          <div key={lbl} style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{color:"var(--text-sub)",fontSize:13}}>{lbl}</span>
            <button onClick={()=>fn(v=>Math.max(mn,v-1))} style={{...GB,padding:"4px 10px"}}>−</button>
            <span style={{color:"var(--text)",fontWeight:700,minWidth:20,textAlign:"center"}}>{val}</span>
            <button onClick={()=>fn(v=>Math.min(mx,v+1))} style={{...GB,padding:"4px 10px"}}>+</button>
          </div>
        ))}
        <div style={{color:"var(--text-muted)",fontSize:12,marginLeft:"auto"}}>
          {mealPlanItems.length} meals · auto-updates as you add to plan
        </div>
      </div>

      {/* Budget tracker */}
      {weeklyBudget && autoList.length > 0 && (() => {
        const COST_BY_CAT = {produce:2.5,meat:8,dairy:4,grains:3,other:2};
        const estimated = autoList.reduce((s,item) => {
          const cat = item.section||"other";
          const costCat = {produce:"produce",meat:"meat",dairy:"dairy",grains:"grains",other:"other"}[cat]||"other";
          const mult = Math.min(2, Math.max(0.25, (item.amount||1)/4));
          return s + COST_BY_CAT[costCat] * mult;
        }, 0);
        const under = estimated <= weeklyBudget;
        return (
          <div style={{background:under?"rgba(90,173,142,0.08)":"rgba(240,128,128,0.08)",border:"1px solid "+(under?"rgba(90,173,142,0.3)":"rgba(240,128,128,0.3)"),borderRadius:14,padding:"12px 16px",marginBottom:14,display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
            <span style={{fontSize:22}}>💰</span>
            <div style={{flex:1}}>
              <div style={{color:"var(--text)",fontWeight:700,fontSize:13}}>Estimated grocery cost</div>
              <div style={{color:"var(--text-muted)",fontSize:11}}>Based on {autoList.length} ingredients in your meal plan</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{color:under?"#5aad8e":"#f08080",fontWeight:800,fontSize:20}}>${estimated.toFixed(2)}</div>
              <div style={{color:"var(--text-muted)",fontSize:11}}>of ${weeklyBudget} budget · {under?`$${(weeklyBudget-estimated).toFixed(2)} under`:`$${(estimated-weeklyBudget).toFixed(2)} over`}</div>
            </div>
            <div style={{width:"100%",height:6,background:"var(--nm-input-bg)",borderRadius:3,overflow:"hidden",boxShadow:"var(--nm-inset)"}}>
              <div style={{height:"100%",width:Math.min(estimated/weeklyBudget*100,100)+"%",background:under?"#5aad8e":"#f08080",borderRadius:3,transition:"width .4s"}}/>
            </div>
          </div>
        );
      })()}

      {mealPlanItems.length===0 && manualItems.length===0 && (
        <div style={{textAlign:"center",padding:"40px 0",color:"var(--text-muted)"}}>
          <div style={{fontSize:40,marginBottom:12}}>🛒</div>
          <div style={{fontSize:14,marginBottom:6}}>Your shopping list is empty</div>
          <div style={{fontSize:12}}>Add recipes to your Meal Plan and they'll appear here automatically</div>
        </div>
      )}

      {/* Manual add */}
      <div style={{display:"flex",gap:8,marginBottom:18}}>
        <input value={newItem} onChange={e=>setNewItem(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addManual()}
          placeholder="Add item manually…" style={{...IS,flex:1,height:38,padding:"0 12px"}}/>
        <button onClick={addManual} style={{...GB,padding:"8px 16px",background:"var(--accent)",color:"#fff",fontWeight:700}}>+ Add</button>
      </div>

      {/* List */}
      {allItems.length>0 && (bySection ? (
        SECTIONS.map(sec=>{
          const items = allItems.filter(x=>x.section===sec.key);
          if (!items.length) return null;
          return (
            <div key={sec.key} style={{marginBottom:18}}>
              <div style={{color:sec.color,fontWeight:700,fontSize:12,letterSpacing:.8,textTransform:"uppercase",marginBottom:8,paddingLeft:4}}>{sec.label}</div>
              {renderItems(items)}
            </div>
          );
        })
      ) : renderItems(allItems))}

      {checkedItems.length>0 && (
        <div style={{marginTop:16,opacity:.6}}>
          <div style={{color:"var(--text-muted)",fontSize:11,fontWeight:700,letterSpacing:.8,textTransform:"uppercase",marginBottom:8}}>✅ In Cart</div>
          {renderItems(checkedItems)}
        </div>
      )}

      {/* Spend Logger */}
      <div style={{marginTop:24,background:"var(--bg-card)",boxShadow:"var(--nm-raised)",borderRadius:14,padding:"14px 16px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:showSpendLog?12:0}}>
          <div style={{color:"var(--text)",fontWeight:700,fontSize:13}}>💰 Log Spending</div>
          <button onClick={()=>setShowSpendLog(s=>!s)} style={{...GB,fontSize:12,padding:"4px 10px"}}>{showSpendLog?"Cancel":"+ Add"}</button>
        </div>
        {showSpendLog && (
          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
            <div style={{flex:"0 0 110px"}}>
              <div style={{color:"var(--text-muted)",fontSize:10,marginBottom:4}}>Amount ($)</div>
              <input type="number" value={spendInput} onChange={e=>setSpendInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&logSpend()}
                placeholder="0.00" style={{...IS,height:34,padding:"0 10px",fontSize:14}}/>
            </div>
            <div style={{flex:1,minWidth:120}}>
              <div style={{color:"var(--text-muted)",fontSize:10,marginBottom:4}}>Note (optional)</div>
              <input value={spendNote} onChange={e=>setSpendNote(e.target.value)} onKeyDown={e=>e.key==="Enter"&&logSpend()}
                placeholder="e.g. Whole Foods run" style={{...IS,height:34,padding:"0 10px",fontSize:13}}/>
            </div>
            <button onClick={logSpend} style={{...GB,padding:"8px 14px",background:"var(--accent)",color:"#fff",fontWeight:700,fontSize:13}}>Save</button>
          </div>
        )}
        {(spends||[]).length>0 && (
          <div style={{marginTop:showSpendLog?12:0}}>
            <div style={{color:"var(--text-muted)",fontSize:10,fontWeight:700,marginBottom:6,textTransform:"uppercase"}}>Recent</div>
            {(spends||[]).slice(-3).reverse().map(s=>(
              <div key={s.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:"1px solid var(--border)",fontSize:12}}>
                <span style={{color:"var(--text-sub)"}}>{s.note}</span>
                <div style={{display:"flex",gap:10,alignItems:"center"}}>
                  <span style={{color:"var(--text-muted)",fontSize:11}}>{new Date(s.date).toLocaleDateString()}</span>
                  <span style={{color:"var(--accent)",fontWeight:700}}>${s.amount.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MEAL PLAN MANAGER ───────────────────────────────────────────────────────
function MealPlanManager({recipes, mealPlanItems, setMealPlanItems, onGoShopping}) {
  const [tab, setTab] = useState("plan");
  const [people, setPeople] = useState(2);
  const [weeks, setWeeks] = useState(1);
  const [addRec, setAddRec] = useState(null);
  const [addPortions, setAddPortions] = useState(1);
  const [addDay, setAddDay] = useState("Monday");
  const [bySection, setBySection] = useState(false);
  const [budget, setBudget] = useState(70);
  const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

  const SECTION_KEYWORDS = {
    produce: /onion|garlic|tomato|pepper|spinach|carrot|celery|broccoli|mushroom|zucchini|avocado|lemon|lime|fruit|berry|apple|banana|herb|basil|cilantro|parsley/,
    meat: /chicken|beef|salmon|tuna|fish|shrimp|egg|turkey|pork|lamb|meat|protein/,
    dairy: /milk|cheese|yogurt|butter|cream|cheddar|mozzarella|feta|parmesan|whey/,
    grains: /rice|oat|quinoa|pasta|flour|bread|noodle|cereal|tortilla|oil|sauce|vinegar|soy|salt|pepper|spice|cumin|paprika|oregano|sugar|honey|nut|almond|seed/,
  };
  const SECTION_INFO = [
    {key:"produce",label:"Produce",icon:"🥦",color:"#5aad8e",cost:2},
    {key:"meat",label:"Meat & Fish",icon:"🥩",color:"#d4875a",cost:8},
    {key:"dairy",label:"Dairy",icon:"🧀",color:"#ffd580",cost:4},
    {key:"grains",label:"Grains & Pantry",icon:"🌾",color:"#c8a8ff",cost:3},
    {key:"other",label:"Other",icon:"🛒",color:"#8a9bb0",cost:2},
  ];

  const categorizeItem = name => {
    const n = (name||"").toLowerCase();
    for (const [key,rx] of Object.entries(SECTION_KEYWORDS)) if (rx.test(n)) return key;
    return "other";
  };

  const addItem = () => {
    if (!addRec) return;
    setMealPlanItems(p=>[...p,{type:"recipe",name:addRec.title,recipe:addRec,portions:addPortions,day:addDay,nutrition:{calories:Math.round(addRec.nutrition.calories*addPortions),protein:Math.round(addRec.nutrition.protein*addPortions),carbs:Math.round(addRec.nutrition.carbs*addPortions),fat:Math.round(addRec.nutrition.fat*addPortions)},id:Date.now()}]);
    setAddRec(null); setAddPortions(1);
  };

  const buildList = () => {
    const m = {};
    mealPlanItems.forEach(item=>{
      const recs = item.type==="combo"?(item.recipes||[]):[item.recipe].filter(Boolean);
      recs.forEach(r=>(r.ingredients||[]).forEach(ing=>{
        const k = ing.name.toLowerCase();
        const amt = ing.amount*(item.portions||1)*people*weeks;
        if (m[k]) m[k].amount += amt;
        else m[k]={name:ing.name,amount:amt,unit:ing.unit};
      }));
    });
    return Object.values(m).sort((a,b)=>a.name.localeCompare(b.name));
  };

  const shoppingList = mealPlanItems.length ? buildList() : [];

  const estimateCost = list => list.reduce((total, item) => {
    const sec = SECTION_INFO.find(s=>s.key===categorizeItem(item.name)) || SECTION_INFO[4];
    return total + sec.cost * Math.max(0.5, item.amount/2);
  }, 0);

  const totalCost = estimateCost(shoppingList);

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18,flexWrap:"wrap",gap:10}}>
        <div>
          <h2 style={{color:"#fff",fontFamily:"'Playfair Display',serif",margin:"0 0 4px"}}>Meal Plan</h2>
          <p style={{color:"#8a9bb0",fontSize:13,margin:0}}>{mealPlanItems.length} meals planned</p>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setTab("plan")} style={{...GB,background:tab==="plan"?"rgba(58,125,94,0.22)":"var(--bg-card)",color:tab==="plan"?"var(--accent)":"var(--text-sub)",borderRadius:20,padding:"7px 18px",fontSize:13}}>📅 Weekly Plan</button>
          {onGoShopping && <button onClick={onGoShopping} style={{...GB,background:"rgba(90,143,212,0.15)",color:"#7ab0f0",borderRadius:20,padding:"7px 18px",fontSize:13}}>🛒 Shopping List →</button>}
        </div>
      </div>

      {tab==="plan" && (
        <div>
          <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:14,padding:16,marginBottom:18}}>
            <div style={{color:"#c8d0dc",fontWeight:600,fontSize:14,marginBottom:12}}>➕ Add recipe to plan</div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
              <div style={{flex:2,minWidth:160}}>
                <div style={{color:"#8a9bb0",fontSize:10,fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>Recipe</div>
                <select value={(addRec&&addRec.id)||""} onChange={e=>{const r=recipes.find(x=>x.id===+e.target.value);setAddRec(r||null);}} style={IS}>
                  <option value="">— Select —</option>
                  {recipes.map(r=><option key={r.id} value={r.id}>{r.title}</option>)}
                </select>
              </div>
              <div>
                <div style={{color:"#8a9bb0",fontSize:10,fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>Portions</div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <button onClick={()=>setAddPortions(v=>Math.max(1,v-1))} style={{...GB,padding:"5px 10px"}}>−</button>
                  <span style={{color:"#fff",fontWeight:700,minWidth:20,textAlign:"center"}}>{addPortions}</span>
                  <button onClick={()=>setAddPortions(v=>v+1)} style={{...GB,padding:"5px 10px"}}>+</button>
                </div>
              </div>
              <div style={{flex:1,minWidth:130}}>
                <div style={{color:"#8a9bb0",fontSize:10,fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>Day</div>
                <select value={addDay} onChange={e=>setAddDay(e.target.value)} style={IS}>
                  {DAYS.map(d=><option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <button onClick={addItem} disabled={!addRec} style={{background:addRec?"linear-gradient(135deg,#3a7d5e,#5aad8e)":"rgba(255,255,255,0.05)",border:"none",borderRadius:10,color:addRec?"#fff":"#5a6a7a",padding:"11px 18px",fontWeight:700,fontSize:13,cursor:addRec?"pointer":"not-allowed",fontFamily:"inherit"}}>Add</button>
            </div>
          </div>

          {mealPlanItems.length===0
            ? <div style={{textAlign:"center",padding:"48px 0",color:"#5a6a7a"}}><div style={{fontSize:42,marginBottom:10}}>📅</div><div style={{fontSize:15,color:"#8a9bb0"}}>No meals planned yet</div></div>
            : <div style={{display:"grid",gap:10}}>
                {DAYS.map(day=>{
                  const items = mealPlanItems.filter(i=>i.day===day);
                  if (!items.length) return null;
                  const dayKcal = items.reduce((a,i)=>a+((i.nutrition&&i.nutrition.calories)||0),0);
                  return (
                    <div key={day} style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:14,overflow:"hidden"}}>
                      <div style={{padding:"10px 16px",borderBottom:"1px solid rgba(255,255,255,0.06)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{color:"#c8d0dc",fontWeight:700,fontSize:14}}>{day}</span>
                        {dayKcal>0 && <span style={{color:"#6a7a90",fontSize:12}}>{dayKcal} kcal</span>}
                      </div>
                      <div style={{padding:"10px 12px",display:"grid",gap:8}}>
                        {items.map(item=>(
                          <div key={item.id} style={{display:"flex",alignItems:"center",gap:10,background:"rgba(255,255,255,0.03)",borderRadius:10,overflow:"hidden",border:"1px solid rgba(255,255,255,0.06)"}}>
                            {item.recipe?.image && <img src={item.recipe.image} alt={item.name} style={{width:56,height:56,objectFit:"cover",flexShrink:0}}/>}
                            <div style={{flex:1,minWidth:0,padding:item.recipe?.image?"6px 0":"8px 12px"}}>
                              <div style={{color:"#e2d9c8",fontWeight:600,fontSize:13}}>{item.name}</div>
                              <div style={{color:"#6a7a90",fontSize:11,marginTop:2}}>{item.portions} portion{item.portions!==1?"s":""}{item.nutrition&&item.nutrition.calories?" · "+item.nutrition.calories+"kcal":""}</div>
                            </div>
                            <button onClick={()=>setMealPlanItems(p=>p.filter(i=>i.id!==item.id))} style={{background:"rgba(200,60,60,0.12)",border:"1px solid rgba(200,60,60,0.2)",color:"#f88",borderRadius:7,cursor:"pointer",padding:"4px 9px",fontSize:12,marginRight:8}}>✕</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
          }
        </div>
      )}

      {tab==="__removed_shopping__" && (
        <div>
          <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:14,padding:"14px 18px",marginBottom:14,display:"flex",gap:16,flexWrap:"wrap",alignItems:"center"}}>
            {[["People",people,setPeople,1,20],["Weeks",weeks,setWeeks,1,4]].map(([lbl,val,fn,mn,mx])=>(
              <div key={lbl} style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{color:"#c8d0dc",fontSize:13}}>{lbl}</span>
                <button onClick={()=>fn(v=>Math.max(mn,v-1))} style={{...GB,padding:"3px 11px"}}>−</button>
                <span style={{color:"#fff",fontWeight:700,fontSize:18,minWidth:22,textAlign:"center"}}>{val}</span>
                <button onClick={()=>fn(v=>Math.min(mx,v+1))} style={{...GB,padding:"3px 11px"}}>+</button>
              </div>
            ))}
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{color:"#c8d0dc",fontSize:13}}>Budget $</span>
              <input type="number" value={budget} onChange={e=>setBudget(+e.target.value)} style={{...IS,width:70,padding:"4px 8px",fontSize:13}}/>
              <span style={{color:"#6a7a90",fontSize:12}}>/week</span>
            </div>
            <button onClick={()=>setBySection(s=>!s)} style={{...GB,background:bySection?"rgba(58,125,94,0.22)":"rgba(255,255,255,0.05)",color:bySection?"#5aad8e":"#8a9bb0"}}>
              {bySection?"📋 All Items":"🏪 By Section"}
            </button>
            <button onClick={()=>{const txt=shoppingList.map(i=>i.name+": "+i.amount.toFixed(1)+" "+i.unit).join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([txt],{type:"text/plain"}));a.download="shopping-list.txt";a.click();}} style={{...GB,marginLeft:"auto"}}>📄 Export</button>
          </div>

          {shoppingList.length>0 && (
            <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:14,padding:"12px 16px",marginBottom:14,display:"flex",gap:12,flexWrap:"wrap",alignItems:"center"}}>
              <div style={{flex:1}}>
                <span style={{color:"#c8d0dc",fontSize:13}}>Estimated Total: </span>
                <span style={{color:"#ffd580",fontWeight:700,fontSize:15}}>${totalCost.toFixed(2)}</span>
                <span style={{color:"#6a7a90",fontSize:12}}> / {budget} budget</span>
              </div>
              <span style={{fontWeight:700,fontSize:13,color:totalCost<=budget?"#5aad8e":"#f08080"}}>
                {totalCost<=budget?"Under budget ✓":"Over budget ✗"}
              </span>
            </div>
          )}

          {shoppingList.length>0 && (
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
              {[
                ["🛒 Instacart","https://www.instacart.com/store/"+encodeURIComponent(shoppingList[0]?.name||"")],
                ["📦 Amazon Fresh","https://www.amazon.com/s?k="+shoppingList.slice(0,3).map(i=>encodeURIComponent(i.name)).join("+")+"grocery"],
                ["🏪 Walmart","https://www.walmart.com/search?q="+shoppingList.slice(0,3).map(i=>encodeURIComponent(i.name)).join("+")],
              ].map(([label,url])=>(
                <a key={label} href={url} target="_blank" rel="noreferrer"
                  style={{...GB,textDecoration:"none",display:"inline-flex",alignItems:"center",background:"rgba(90,143,212,0.1)",border:"1px solid rgba(90,143,212,0.25)",color:"#7ab0e8",fontSize:12}}>
                  {label}
                </a>
              ))}
            </div>
          )}

          {shoppingList.length===0
            ? <div style={{textAlign:"center",padding:"48px 0",color:"#5a6a7a"}}><div style={{fontSize:38,marginBottom:10}}>🛒</div><div style={{fontSize:14,color:"#8a9bb0"}}>Add meals to your plan first</div></div>
            : bySection
              ? SECTION_INFO.map(sec=>{
                  const items = shoppingList.filter(item=>categorizeItem(item.name)===sec.key);
                  if (!items.length) return null;
                  return (
                    <div key={sec.key} style={{marginBottom:14}}>
                      <div style={{color:sec.color,fontWeight:700,fontSize:13,marginBottom:8}}>{sec.icon} {sec.label}</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
                        {items.map((item,i)=>(
                          <div key={i} style={{display:"flex",justifyContent:"space-between",background:"rgba(255,255,255,0.04)",borderRadius:9,padding:"8px 12px",border:"1px solid "+sec.color+"25"}}>
                            <span style={{color:"#c8d0dc",fontSize:13}}>{item.name}</span>
                            <span style={{color:sec.color,fontWeight:700,fontSize:13}}>{item.amount.toFixed(1)} {item.unit}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              : <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
                  {shoppingList.map((item,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",background:"rgba(255,255,255,0.04)",borderRadius:9,padding:"8px 12px",border:"1px solid rgba(255,255,255,0.06)"}}>
                      <span style={{color:"#c8d0dc",fontSize:13}}>🟢 {item.name}</span>
                      <span style={{color:"#5aad8e",fontWeight:700,fontSize:13}}>{item.amount.toFixed(1)} {item.unit}</span>
                    </div>
                  ))}
                </div>
          }
        </div>
      )}
    </div>
  );
}

// ─── FAVORITES VIEW ───────────────────────────────────────────────────────────
function FavoritesView({favorites, recipes, setFavorites, onView, onExportBook}) {
  const favRecipes = favorites.map(f=>recipes.find(r=>r.id===f.id)||f).filter(Boolean);
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:10}}>
        <div>
          <h2 style={{color:"#fff",fontFamily:"'Playfair Display',serif",margin:"0 0 4px"}}>Favorites</h2>
          <p style={{color:"#8a9bb0",fontSize:13,margin:0}}>{favRecipes.length} saved recipes</p>
        </div>
        {favRecipes.length>0 && (
          <button onClick={()=>exportMealBookToPDF(favRecipes,"My Favorite Recipes")} style={{...GB}}>📚 Export Cookbook PDF</button>
        )}
      </div>
      {favRecipes.length===0
        ? <div style={{textAlign:"center",padding:"70px 0"}}>
            <div style={{fontSize:48,marginBottom:14}}>♡</div>
            <div style={{color:"#fff",fontSize:17,fontFamily:"'Playfair Display',serif",marginBottom:6}}>No favorites yet</div>
            <div style={{color:"#6a7a90",fontSize:13}}>Tap the heart on any recipe to save it here</div>
          </div>
        : <div className="r-grid">
            {favRecipes.map(r=>(
              <RecipeCard key={r.id} recipe={r} onClick={onView}
                onFavorite={()=>setFavorites(p=>p.filter(f=>f.id!==r.id))} isFavorite={true}/>
            ))}
          </div>
      }
    </div>
  );
}

// ─── INGREDIENT SEARCH ────────────────────────────────────────────────────────
function IngredientSearch({recipes, onView}) {
  const [query, setQuery] = useState("");
  const results = query.trim().length>1
    ? recipes.filter(r=>(r.ingredients||[]).some(i=>(i.name||"").toLowerCase().includes(query.toLowerCase())))
    : [];
  return (
    <div>
      <h2 style={{color:"#fff",fontFamily:"'Playfair Display',serif",marginBottom:6}}>Ingredient Search</h2>
      <p style={{color:"#8a9bb0",fontSize:13,marginBottom:18}}>Find recipes by ingredient</p>
      <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="e.g. chicken, quinoa, matcha..."
        style={{...IS,marginBottom:20,fontSize:15}}/>
      {query.trim().length>1 && (
        results.length===0
          ? <div style={{textAlign:"center",padding:"48px 0",color:"#5a6a7a"}}>No recipes found with "{query}"</div>
          : <div className="r-grid">
              {results.map(r=><RecipeCard key={r.id} recipe={r} onClick={onView}/>)}
            </div>
      )}
    </div>
  );
}

// ─── RATING MODAL ─────────────────────────────────────────────────────────────
function RatingModal({recipe, existing, onSave, onClose}) {
  const [taste, setTaste] = useState((existing&&existing.taste)||0);
  const [difficulty, setDifficulty] = useState((existing&&existing.difficulty)||0);
  const [timeAccuracy, setTimeAccuracy] = useState((existing&&existing.timeAccuracy)||0);
  const [spice, setSpice] = useState((existing&&existing.spice)||0);
  const Stars = ({val,set}) => (
    <div style={{display:"flex",gap:4}}>
      {[1,2,3,4,5].map(i=>(
        <button key={i} onClick={()=>set(i)} style={{background:"none",border:"none",cursor:"pointer",fontSize:28,color:i<=val?"#ffd580":"#2a3444",padding:2}}>★</button>
      ))}
    </div>
  );
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:1001,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#0d0f17",border:"1px solid rgba(255,255,255,0.08)",borderRadius:20,padding:28,maxWidth:400,width:"100%"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h3 style={{color:"#fff",fontFamily:"'Playfair Display',serif",margin:0}}>Rate: {recipe.title}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#6a7a90",cursor:"pointer",fontSize:22}}>×</button>
        </div>
        {[["⭐ Taste",taste,setTaste],["💪 Difficulty",difficulty,setDifficulty],["🕐 Time Accuracy",timeAccuracy,setTimeAccuracy],["🌶 Spice",spice,setSpice]].map(([label,val,set])=>(
          <div key={label} style={{marginBottom:16}}>
            <div style={{color:"#8a9bb0",fontSize:13,marginBottom:8}}>{label}</div>
            <Stars val={val} set={set}/>
          </div>
        ))}
        <button onClick={()=>{onSave(recipe.id,{taste,difficulty,timeAccuracy,spice});onClose();}} style={{width:"100%",background:"linear-gradient(135deg,#3a7d5e,#5aad8e)",border:"none",borderRadius:12,color:"#fff",padding:14,fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>
          Save Rating
        </button>
      </div>
    </div>
  );
}

// ─── COOK MODE ───────────────────────────────────────────────────────────────
// Build a static prep guide from recipe data (no AI needed)
function buildStaticPrepGuide(recipe) {
  const guide = {preheat:[],startFirst:[],prep:[],wash:[],tips:[]};
  const equip = recipe.equipment||[];
  const ings = recipe.ingredients||[];
  const steps = recipe.steps||[];

  if (equip.includes("oven")) guide.preheat.push("Preheat oven to 400°F / 200°C");
  if (equip.includes("air fryer")) guide.preheat.push("Preheat air fryer to 375°F / 190°C for 3 min");

  ings.forEach(ing=>{
    const n=(ing.name||"").toLowerCase();
    if (/\brice\b/.test(n)) guide.startFirst.push(`Start rice cooker — rinse ${ing.amount} ${ing.unit} ${ing.name} first (takes ~20 min)`);
    if (/quinoa/.test(n)) guide.startFirst.push(`Start quinoa first — simmer ${ing.amount} ${ing.unit} (takes ~15 min)`);
    if (/pasta|spaghetti|penne|noodle/.test(n)) guide.startFirst.push("Put water on to boil for pasta now — takes time to heat");
    if (/lentil|chickpea|dried bean/.test(n)) guide.startFirst.push(`Soak or boil ${ing.name} first — takes 20–40 min`);
  });

  ings.forEach(ing=>{
    const n=(ing.name||"").toLowerCase();
    if (/vegetable|broccoli|spinach|lettuce|tomato|pepper|zucchini|cucumber|celery|mushroom|herb|parsley|cilantro|kale|chard|carrot|asparagus|bean sprout/.test(n))
      guide.wash.push(`Rinse ${ing.name} under cold water`);
    if (/berr|fruit|apple|grape/.test(n)) guide.wash.push(`Wash ${ing.name}`);
    if (/chicken|pork|lamb/.test(n)) guide.wash.push(`Pat ${ing.name} dry with paper towels (helps browning)`);
  });

  steps.forEach(s=>{
    const t=(s.text||"").toLowerCase();
    if (/\bchop\b|\bdice\b|\bslice\b|\bmince\b|\bjulienne\b|\bgrate\b|\bshred\b|\bpeel\b/.test(t))
      guide.prep.push(s.text.length>90 ? s.text.slice(0,90)+"…" : s.text);
  });

  if ((recipe.nutrition?.protein||0)>25) guide.tips.push("High-protein meal — don't overcook the protein or it'll dry out");
  if (equip.includes("stove")&&equip.includes("oven")) guide.tips.push("Use oven & stovetop simultaneously to cut total time");
  if (ings.some(i=>/(garlic|onion)/i.test(i.name))) guide.tips.push("Prep garlic & onion first — they take longest to soften");
  if (ings.some(i=>/olive oil|butter/i.test(i.name))) guide.tips.push("Heat oil/butter before adding ingredients for better searing");

  return guide;
}

function CookMode({recipe, onClose}) {
  const [phase, setPhase] = useState("prep"); // "prep" | "cook"
  const [step, setStep] = useState(0);
  const [prepGuide, setPrepGuide] = useState(()=>buildStaticPrepGuide(recipe));
  const [loadingAI, setLoadingAI] = useState(false);
  const [checked, setChecked] = useState({});
  const [timer, setTimer] = useState(null);
  const [running, setRunning] = useState(false);
  const timerRef = useRef(null);
  const steps = recipe.steps||[];
  const current = steps[step]||{};
  const toggleCheck = key => setChecked(c=>({...c,[key]:!c[key]}));

  // AI-enhance the prep guide
  useEffect(()=>{
    const enhance = async () => {
      setLoadingAI(true);
      try {
        const ingList = (recipe.ingredients||[]).map(i=>`${i.amount} ${i.unit} ${i.name}`).join(", ");
        const stepList = (recipe.steps||[]).map((s,i)=>`${i+1}. ${s.text} (${s.timeMin||0}min)`).join("\n");
        const raw = await anthropicCall({max_tokens:700,
          system:"You are a professional chef. Given a recipe return a JSON prep guide. Return ONLY valid JSON, no markdown.",
          messages:[{role:"user",content:`Recipe: ${recipe.title}\nEquipment: ${(recipe.equipment||[]).join(", ")}\nIngredients: ${ingList}\nSteps:\n${stepList}\n\nReturn JSON with keys: preheat (array of strings), startFirst (array), prep (array of cutting/chopping tasks), wash (array), tips (array of chef tips). Keep each item under 80 chars.`}]
        });
        const m = raw.match(/\{[\s\S]*\}/);
        if (m) {
          const ai = JSON.parse(m[0]);
          setPrepGuide(g=>({
            preheat:[...(ai.preheat||g.preheat)],
            startFirst:[...(ai.startFirst||g.startFirst)],
            prep:[...(ai.prep||g.prep)],
            wash:[...(ai.wash||g.wash)],
            tips:[...(ai.tips||g.tips)],
          }));
        }
      } catch(e){}
      setLoadingAI(false);
    };
    enhance();
  }, [recipe.id]);

  // Timer per step
  useEffect(()=>{ if(current.timeMin) setTimer(current.timeMin*60); setRunning(false); clearInterval(timerRef.current); },[step]);
  useEffect(()=>{
    if(running&&timer>0){ timerRef.current=setInterval(()=>setTimer(t=>{if(t<=1){clearInterval(timerRef.current);setRunning(false);try{new Notification("⏰ Step done!",{body:current.text?.slice(0,60)});}catch(e){}return 0;}return t-1;}),1000); }
    return ()=>clearInterval(timerRef.current);
  },[running]);

  // Wake lock — keep screen on
  useEffect(()=>{ let wl; try{if(navigator.wakeLock)navigator.wakeLock.request("screen").then(w=>wl=w);}catch(e){} return()=>{try{wl?.release();}catch(e){}};  },[]);

  const fmtTime = s => {
    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
    if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
    return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  };


  // Ingredients relevant to current step (name mentioned in step text)
  const stepIngredients = (recipe.ingredients||[]).filter(ing=>
    (current.text||"").toLowerCase().includes((ing.name||"").toLowerCase().split(" ")[0])
  );

  const totalAllTasks = [...(prepGuide.preheat||[]),...(prepGuide.startFirst||[]),...(prepGuide.wash||[]),...(prepGuide.prep||[])];
  const doneCount = totalAllTasks.filter((_,i)=>checked[i]).length;

  // ── PREP PHASE ──────────────────────────────────────────────────────────────
  if (phase==="prep") {
    const Section = ({icon,title,color,items,offset=0}) => items.length===0?null:(
      <div style={{marginBottom:18}}>
        <div style={{color,fontWeight:700,fontSize:12,letterSpacing:.8,textTransform:"uppercase",marginBottom:8}}>{icon} {title}</div>
        {items.map((t,i)=>{
          const idx=offset+i; const done=!!checked[idx];
          return (
            <div key={i} onClick={()=>toggleCheck(idx)}
              style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 12px",borderRadius:10,marginBottom:5,cursor:"pointer",background:done?"var(--nm-input-bg)":"var(--bg-card)",boxShadow:done?"var(--nm-inset)":"var(--nm-raised-sm)",opacity:done?.6:1,transition:"all .15s"}}>
              <div style={{width:22,height:22,borderRadius:6,border:"2px solid "+(done?color:"var(--border)"),background:done?color+"30":"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color,flexShrink:0,marginTop:1}}>{done?"✓":""}</div>
              <span style={{color:"var(--text)",fontSize:13,lineHeight:1.5,textDecoration:done?"line-through":"none",flex:1}}>{t}</span>
            </div>
          );
        })}
      </div>
    );

    let offset=0;
    const ph=prepGuide.preheat||[],sf=prepGuide.startFirst||[],ws=prepGuide.wash||[],pr=prepGuide.prep||[];

    return (
      <div style={{position:"fixed",inset:0,background:"var(--bg)",zIndex:2000,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {/* Header */}
        <div style={{padding:"14px 18px",background:"var(--bg-sidebar)",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          <button onClick={onClose} style={{...GB,padding:"6px 12px",fontSize:13}}>✕</button>
          <div style={{flex:1}}>
            <div style={{color:"var(--text)",fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:15}}>{recipe.title}</div>
            <div style={{color:"var(--text-muted)",fontSize:11,marginTop:2}}>🧑‍🍳 Prep Phase · {doneCount}/{totalAllTasks.length} tasks done {loadingAI&&"· AI enhancing…"}</div>
          </div>
          {doneCount>0&&<div style={{color:"var(--accent)",fontSize:12,fontWeight:700}}>{Math.round(doneCount/Math.max(totalAllTasks.length,1)*100)}%</div>}
        </div>
        {/* Progress */}
        <div style={{height:3,background:"var(--border)"}}><div style={{height:"100%",width:(totalAllTasks.length?doneCount/totalAllTasks.length*100:0)+"%",background:"var(--accent)",transition:"width .3s"}}/></div>

        <div style={{flex:1,overflowY:"auto",padding:"18px 16px 100px",maxWidth:680,margin:"0 auto",width:"100%"}}>
          {/* Hero image */}
          {recipe.image && <div style={{borderRadius:16,overflow:"hidden",marginBottom:18,height:160,boxShadow:"var(--nm-raised)"}}><img src={recipe.image} alt={recipe.title} style={{width:"100%",height:"100%",objectFit:"cover"}}/></div>}

          {/* Optimization checklist */}
          <Section icon="🔥" title="Preheat First" color="#e07a40" items={ph} offset={offset} />
          {offset+=ph.length}
          <Section icon="⏱" title="Start These First (Long Cook)" color="#ffd580" items={sf} offset={offset}/>
          {offset+=sf.length}
          <Section icon="🚿" title="Wash & Clean" color="#5a8fd4" items={ws} offset={offset}/>
          {offset+=ws.length}
          <Section icon="🔪" title="Prep & Cut" color="#d4875a" items={pr} offset={offset}/>

          {/* Chef tips */}
          {(prepGuide.tips||[]).length>0 && (
            <div style={{background:"rgba(90,173,142,0.08)",border:"1px solid rgba(90,173,142,0.25)",borderRadius:12,padding:"12px 14px",marginBottom:18}}>
              <div style={{color:"#5aad8e",fontWeight:700,fontSize:12,marginBottom:8}}>👨‍🍳 Chef Tips</div>
              {(prepGuide.tips||[]).map((t,i)=>(
                <div key={i} style={{color:"var(--text-sub)",fontSize:13,lineHeight:1.5,marginBottom:4}}>• {t}</div>
              ))}
            </div>
          )}

          {/* Ingredients overview */}
          <div style={{marginBottom:18}}>
            <div style={{color:"var(--text-sub)",fontWeight:700,fontSize:12,letterSpacing:.8,textTransform:"uppercase",marginBottom:10}}>🥗 All Ingredients ({(recipe.ingredients||[]).length})</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:8}}>
              {(recipe.ingredients||[]).map((ing,i)=>(
                <div key={i} style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised-sm)",borderRadius:10,overflow:"hidden"}}>
                  {ing.image
                    ? <img src={ing.image} alt={ing.name} style={{width:"100%",height:70,objectFit:"cover"}}/>
                    : <div style={{width:"100%",height:70,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,background:"var(--nm-input-bg)"}}>{getItemEmoji(ing.name)}</div>
                  }
                  <div style={{padding:"6px 8px"}}>
                    <div style={{color:"var(--text)",fontSize:11,fontWeight:600,lineHeight:1.3}}>{ing.name}</div>
                    <div style={{color:"var(--accent)",fontSize:11,fontWeight:700}}>{ing.amount} {ing.unit}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Steps overview */}
          <div>
            <div style={{color:"var(--text-sub)",fontWeight:700,fontSize:12,letterSpacing:.8,textTransform:"uppercase",marginBottom:10}}>📋 {steps.length} Steps · {recipe.totalTime||0} min total</div>
            {steps.map((s,i)=>(
              <div key={i} style={{display:"flex",gap:10,padding:"8px 0",borderBottom:"1px solid var(--border)",alignItems:"center"}}>
                <div style={{width:22,height:22,borderRadius:"50%",background:STEP_COLORS[i%STEP_COLORS.length],color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,flexShrink:0}}>{i+1}</div>
                <span style={{color:"var(--text-sub)",fontSize:12,flex:1,lineHeight:1.4}}>{s.text.slice(0,70)}{s.text.length>70?"…":""}</span>
                {s.timeMin&&<span style={{color:"var(--text-muted)",fontSize:11,flexShrink:0}}>{s.timeMin}m</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Start cooking button */}
        <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"16px 20px",background:"var(--bg-sidebar)",borderTop:"1px solid var(--border)"}}>
          <button onClick={()=>setPhase("cook")} style={{width:"100%",background:"linear-gradient(135deg,var(--accent2),var(--accent))",border:"none",borderRadius:14,color:"#fff",padding:"16px",fontWeight:800,fontSize:17,cursor:"pointer",fontFamily:"inherit"}}>
            🍳 Start Cooking →
          </button>
        </div>
      </div>
    );
  }

  // ── COOK PHASE ──────────────────────────────────────────────────────────────
  const progress = (step/(steps.length-1||1))*100;
  return (
    <div style={{position:"fixed",inset:0,background:"var(--bg)",zIndex:2000,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {/* Header */}
      <div style={{padding:"12px 18px",background:"var(--bg-sidebar)",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
        <button onClick={()=>setPhase("prep")} style={{...GB,padding:"5px 10px",fontSize:12}}>← Prep</button>
        <div style={{flex:1,textAlign:"center"}}>
          <div style={{color:"var(--text)",fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:15}}>{recipe.title}</div>
        </div>
        <div style={{color:"var(--text-muted)",fontSize:13,fontWeight:700}}>Step {step+1}/{steps.length}</div>
        <button onClick={onClose} style={{...GB,padding:"5px 10px",fontSize:13}}>✕</button>
      </div>
      {/* Progress bar */}
      <div style={{height:4,background:"var(--border)"}}><div style={{height:"100%",width:progress+"%",background:"var(--accent)",transition:"width .4s"}}/></div>

      {/* Step content */}
      <div style={{flex:1,overflowY:"auto",padding:"20px 16px 100px",maxWidth:640,margin:"0 auto",width:"100%"}}>
        {/* Step images */}
        {getStepImages(current).length > 0 && (
          <div style={{marginBottom:20}}>
            {getStepImages(current).length === 1
              ? <div style={{borderRadius:16,overflow:"hidden",boxShadow:"var(--nm-raised)",background:"#0d0f17",textAlign:"center"}}>
                  <img src={getStepImages(current)[0]} alt="" style={{maxWidth:"100%",maxHeight:380,width:"auto",height:"auto",display:"inline-block",verticalAlign:"bottom"}}/>
                </div>
              : <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:4}}>
                  {getStepImages(current).map((img,idx)=>(
                    <div key={idx} style={{borderRadius:12,overflow:"hidden",flexShrink:0,boxShadow:"var(--nm-raised-sm)",background:"#0d0f17",textAlign:"center"}}>
                      <img src={img} alt="" style={{maxWidth:280,maxHeight:220,width:"auto",height:"auto",display:"inline-block",verticalAlign:"bottom"}}/>
                    </div>
                  ))}
                </div>
            }
          </div>
        )}

        {/* Step card */}
        <div style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised)",borderRadius:20,padding:"24px",marginBottom:18,textAlign:"center"}}>
          <div style={{width:48,height:48,borderRadius:"50%",background:STEP_COLORS[step%STEP_COLORS.length],color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:22,margin:"0 auto 16px"}}>{step+1}</div>
          <p style={{color:"var(--text)",fontSize:20,lineHeight:1.7,margin:0,fontFamily:"'Playfair Display',serif"}}>{current.text}</p>
        </div>

        {/* Timer */}
        {current.timeMin && (
          <div style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised)",borderRadius:16,padding:"18px 24px",textAlign:"center",marginBottom:18}}>
            <div style={{color:"var(--text-muted)",fontSize:11,marginBottom:8,textTransform:"uppercase",letterSpacing:.8}}>⏱ Timer</div>
            <div style={{color:timer===0?"#5aad8e":running?"var(--accent)":"var(--text)",fontWeight:800,fontSize:52,fontVariantNumeric:"tabular-nums",marginBottom:14,lineHeight:1}}>{fmtTime(timer??current.timeMin*60)}</div>
            <div style={{display:"flex",gap:10,justifyContent:"center"}}>
              <button onClick={()=>setRunning(r=>!r)} style={{background:running?"rgba(200,60,60,0.2)":"linear-gradient(135deg,var(--accent2),var(--accent))",border:"none",borderRadius:12,color:running?"#f08080":"#fff",padding:"10px 28px",fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"inherit",boxShadow:"var(--nm-raised-sm)"}}>
                {timer===0?"✅ Done":running?"⏸ Pause":"▶ Start"}
              </button>
              <button onClick={()=>{setTimer(current.timeMin*60);setRunning(false);clearInterval(timerRef.current);}} style={{...GB,padding:"10px 16px",fontSize:16}}>↺</button>
            </div>
          </div>
        )}

        {/* Ingredients used in this step */}
        {stepIngredients.length>0 && (
          <div style={{marginBottom:18}}>
            <div style={{color:"var(--text-sub)",fontSize:12,fontWeight:700,marginBottom:8,textTransform:"uppercase",letterSpacing:.8}}>🥗 Ingredients for this step</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {stepIngredients.map((ing,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:7,background:"var(--bg-card)",boxShadow:"var(--nm-raised-sm)",borderRadius:10,padding:"6px 10px"}}>
                  {ing.image
                    ? <img src={ing.image} alt={ing.name} style={{width:28,height:28,borderRadius:6,objectFit:"cover"}}/>
                    : <span style={{fontSize:20}}>{getItemEmoji(ing.name)}</span>
                  }
                  <div>
                    <div style={{color:"var(--text)",fontSize:12,fontWeight:600}}>{ing.name}</div>
                    <div style={{color:"var(--accent)",fontSize:11}}>{ing.amount} {ing.unit}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All ingredients mini-strip */}
        <div style={{marginBottom:8}}>
          <div style={{color:"var(--text-muted)",fontSize:11,marginBottom:6}}>All ingredients</div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {(recipe.ingredients||[]).map((ing,i)=>{
              const used = stepIngredients.some(s=>s.name===ing.name);
              return (
                <span key={i} style={{background:used?"rgba(90,173,142,0.2)":"var(--nm-input-bg)",border:used?"1px solid rgba(90,173,142,0.4)":"1px solid transparent",borderRadius:20,padding:"3px 10px",fontSize:11,color:used?"#5aad8e":"var(--text-muted)"}}>
                  {getItemEmoji(ing.name)} {ing.name}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Nav buttons */}
      <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"14px 18px",background:"var(--bg-sidebar)",borderTop:"1px solid var(--border)",display:"flex",gap:10}}>
        <button onClick={()=>setStep(s=>Math.max(0,s-1))} disabled={step===0}
          style={{...GB,flex:1,padding:"13px",fontSize:15,opacity:step===0?.35:1}}>← Back</button>
        {step<steps.length-1
          ? <button onClick={()=>setStep(s=>s+1)} style={{flex:2,background:"linear-gradient(135deg,var(--accent2),var(--accent))",border:"none",borderRadius:12,color:"#fff",padding:"13px",fontWeight:800,fontSize:16,cursor:"pointer",fontFamily:"inherit"}}>Next →</button>
          : <button onClick={onClose} style={{flex:2,background:"linear-gradient(135deg,#3a7d5e,#5aad8e)",border:"none",borderRadius:12,color:"#fff",padding:"13px",fontWeight:800,fontSize:16,cursor:"pointer",fontFamily:"inherit"}}>✅ Done!</button>
        }
      </div>
    </div>
  );
}

// ─── PHOTO GALLERY ───────────────────────────────────────────────────────────
function PhotoGallery({recipes, onView}) {
  const [filter, setFilter] = useState("all");
  const withPhotos = recipes.filter(r => r.image);
  const displayed = filter==="all" ? withPhotos : withPhotos.filter(r=>r.category===filter);

  return (
    <div>
      <h2 style={{color:"var(--text)",fontFamily:"'Playfair Display',serif",marginBottom:4}}>📸 Photo Gallery</h2>
      <p style={{color:"var(--text-sub)",fontSize:13,marginBottom:18}}>{withPhotos.length} recipes with photos</p>

      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:18}}>
        {["all","breakfast","lunch","dessert","drink"].map(c=>(
          <button key={c} onClick={()=>setFilter(c)}
            style={{background:"var(--bg-card)",boxShadow:filter===c?"var(--nm-inset)":"var(--nm-raised-sm)",border:"none",borderRadius:20,padding:"5px 14px",cursor:"pointer",fontSize:12,fontFamily:"inherit",color:filter===c?"var(--accent)":"var(--text-sub)"}}>
            {(CATEGORIES.find(x=>x.id===c)||{icon:"🌐"}).icon} {c==="all"?"All":c.charAt(0).toUpperCase()+c.slice(1)}
          </button>
        ))}
      </div>

      {displayed.length===0 ? (
        <div style={{textAlign:"center",padding:"60px 0",color:"var(--text-muted)"}}>
          <div style={{fontSize:48,marginBottom:12}}>📷</div>
          <div style={{fontSize:14,marginBottom:6}}>No photos yet</div>
          <div style={{fontSize:12}}>Upload photos to your recipes to see them here</div>
        </div>
      ) : (
        <div style={{columns:"3 200px",gap:12}}>
          {displayed.map(r=>(
            <div key={r.id} onClick={()=>onView(r)}
              style={{breakInside:"avoid",marginBottom:12,borderRadius:14,overflow:"hidden",cursor:"pointer",position:"relative",boxShadow:"var(--nm-raised)",transition:"transform .2s"}}
              onMouseEnter={e=>e.currentTarget.style.transform="scale(1.02)"}
              onMouseLeave={e=>e.currentTarget.style.transform=""}>
              <img src={r.image} alt={r.title} style={{width:"100%",display:"block",objectFit:"cover"}}
                onError={e=>e.target.closest("div").style.display="none"}/>
              <div style={{position:"absolute",bottom:0,left:0,right:0,background:"linear-gradient(to top,rgba(0,0,0,0.85) 0%,transparent 60%)",padding:"20px 10px 8px"}}>
                <div style={{color:"#fff",fontSize:12,fontWeight:700,lineHeight:1.3}}>{r.title}</div>
                {r.cuisine && <div style={{color:"rgba(255,255,255,0.6)",fontSize:10,marginTop:2}}>🌍 {r.cuisine}</div>}
              </div>
              {(r.spiceLevel||0)>0 && <div style={{position:"absolute",top:6,right:6,fontSize:11,background:"rgba(0,0,0,0.65)",borderRadius:6,padding:"2px 5px"}}>{"🌶".repeat(r.spiceLevel)}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SUPPLEMENT TRACKER ───────────────────────────────────────────────────────
function SupplementTracker({supplements, setSupplements}) {
  const [newName, setNewName] = useState("");
  const [newDose, setNewDose] = useState("");
  const [newTime, setNewTime] = useState("morning");
  const today = new Date().toDateString();

  const addSup = () => {
    if (!newName.trim()) return;
    setSupplements(p=>[...p,{id:Date.now(),name:newName.trim(),dose:newDose.trim(),time:newTime,log:[]}]);
    setNewName(""); setNewDose("");
  };

  const toggleToday = id => {
    setSupplements(p=>p.map(s=>{
      if (s.id!==id) return s;
      const hasToday = (s.log||[]).includes(today);
      return {...s, log: hasToday ? s.log.filter(d=>d!==today) : [...(s.log||[]),today]};
    }));
  };

  const removeSup = id => setSupplements(p=>p.filter(s=>s.id!==id));

  const TIMES = ["morning","afternoon","evening","with meals"];
  const TIME_COLORS = {morning:"#ffd580",afternoon:"#d4875a",evening:"#9b5aad","with meals":"#5aad8e"};
  const TIME_ICONS = {morning:"🌅",afternoon:"☀️",evening:"🌙","with meals":"🍽️"};

  const byTime = TIMES.map(t=>({time:t,items:supplements.filter(s=>s.time===t)})).filter(g=>g.items.length>0);
  const doneToday = supplements.filter(s=>(s.log||[]).includes(today)).length;

  return (
    <div>
      <h2 style={{color:"var(--text)",fontFamily:"'Playfair Display',serif",marginBottom:4}}>💊 Supplement Tracker</h2>
      <p style={{color:"var(--text-sub)",fontSize:13,marginBottom:18}}>{doneToday}/{supplements.length} taken today</p>

      {/* Progress bar */}
      {supplements.length>0 && (
        <div style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised)",borderRadius:12,padding:"12px 16px",marginBottom:18}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:6}}>
            <span style={{color:"var(--text-sub)"}}>Today's progress</span>
            <span style={{color:"var(--accent)",fontWeight:700}}>{doneToday}/{supplements.length}</span>
          </div>
          <div style={{height:8,background:"var(--nm-input-bg)",borderRadius:4,boxShadow:"var(--nm-inset)"}}>
            <div style={{height:"100%",width:(supplements.length?doneToday/supplements.length*100:0)+"%",background:"var(--accent)",borderRadius:4,transition:"width .4s"}}/>
          </div>
        </div>
      )}

      {/* Add supplement */}
      <div style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised)",borderRadius:14,padding:"14px 16px",marginBottom:20}}>
        <div style={{color:"var(--text-sub)",fontSize:11,fontWeight:700,marginBottom:10,textTransform:"uppercase"}}>➕ Add Supplement</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <input value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addSup()}
            placeholder="e.g. Vitamin D3" style={{flex:"1 1 140px",background:"var(--nm-input-bg)",boxShadow:"var(--nm-inset)",border:"none",borderRadius:8,color:"var(--text)",padding:"8px 12px",fontSize:13,outline:"none",fontFamily:"inherit"}}/>
          <input value={newDose} onChange={e=>setNewDose(e.target.value)} placeholder="Dose (e.g. 2000 IU)"
            style={{flex:"1 1 120px",background:"var(--nm-input-bg)",boxShadow:"var(--nm-inset)",border:"none",borderRadius:8,color:"var(--text)",padding:"8px 12px",fontSize:13,outline:"none",fontFamily:"inherit"}}/>
          <select value={newTime} onChange={e=>setNewTime(e.target.value)}
            style={{flex:"0 0 130px",background:"var(--nm-input-bg)",boxShadow:"var(--nm-inset)",border:"none",borderRadius:8,color:"var(--text)",padding:"8px 10px",fontSize:13,outline:"none",fontFamily:"inherit"}}>
            {TIMES.map(t=><option key={t} value={t}>{TIME_ICONS[t]} {t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
          </select>
          <button onClick={addSup} style={{background:"linear-gradient(135deg,var(--accent2),var(--accent))",border:"none",borderRadius:8,color:"#fff",padding:"8px 16px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>+ Add</button>
        </div>
      </div>

      {supplements.length===0 && (
        <div style={{textAlign:"center",padding:"40px 0",color:"var(--text-muted)"}}>
          <div style={{fontSize:40,marginBottom:10}}>💊</div>
          <div style={{fontSize:14}}>No supplements added yet</div>
          <div style={{fontSize:12,marginTop:4}}>Track your vitamins and supplements daily</div>
        </div>
      )}

      {byTime.map(({time,items})=>(
        <div key={time} style={{marginBottom:20}}>
          <div style={{color:TIME_COLORS[time],fontWeight:700,fontSize:12,letterSpacing:.8,textTransform:"uppercase",marginBottom:8}}>
            {TIME_ICONS[time]} {time.charAt(0).toUpperCase()+time.slice(1)}
          </div>
          {items.map(s=>{
            const done = (s.log||[]).includes(today);
            return (
              <div key={s.id} onClick={()=>toggleToday(s.id)}
                style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:12,marginBottom:6,cursor:"pointer",background:done?"var(--nm-input-bg)":"var(--bg-card)",boxShadow:done?"var(--nm-inset)":"var(--nm-raised-sm)",opacity:done?.75:1,transition:"all .15s"}}>
                <div style={{width:24,height:24,borderRadius:"50%",border:"2px solid "+(done?TIME_COLORS[time]:"var(--border)"),background:done?TIME_COLORS[time]+"30":"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,flexShrink:0,color:TIME_COLORS[time]}}>
                  {done?"✓":""}
                </div>
                <div style={{flex:1}}>
                  <div style={{color:"var(--text)",fontSize:13,fontWeight:done?400:600,textDecoration:done?"line-through":"none"}}>{s.name}</div>
                  {s.dose && <div style={{color:"var(--text-muted)",fontSize:11}}>{s.dose}</div>}
                </div>
                <div style={{color:done?TIME_COLORS[time]:"var(--text-muted)",fontSize:11,fontWeight:700}}>{done?"✓ Taken":"Tap to log"}</div>
                <button onClick={e=>{e.stopPropagation();removeSup(s.id);}} style={{background:"none",border:"none",color:"var(--text-muted)",fontSize:14,cursor:"pointer",padding:"0 4px",opacity:.5}} title="Remove">×</button>
              </div>
            );
          })}
        </div>
      ))}

      {/* Streak mini view */}
      {supplements.length>0 && (()=>{
        const last7 = Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-i);return d.toDateString();}).reverse();
        return (
          <div style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised)",borderRadius:14,padding:"14px 16px",marginTop:8}}>
            <div style={{color:"var(--text-sub)",fontSize:11,fontWeight:700,marginBottom:10,textTransform:"uppercase"}}>📅 Last 7 Days</div>
            <div style={{display:"flex",gap:6,justifyContent:"space-between"}}>
              {last7.map(d=>{
                const done = supplements.filter(s=>(s.log||[]).includes(d)).length;
                const total = supplements.length;
                const pct = total?done/total:0;
                const isToday = d===today;
                return (
                  <div key={d} style={{flex:1,textAlign:"center"}}>
                    <div style={{height:40,background:"var(--nm-input-bg)",borderRadius:6,boxShadow:"var(--nm-inset)",position:"relative",overflow:"hidden",marginBottom:4}}>
                      <div style={{position:"absolute",bottom:0,left:0,right:0,height:pct*100+"%",background:pct===1?"var(--accent)":"var(--accent)80",transition:"height .4s"}}/>
                    </div>
                    <div style={{fontSize:9,color:isToday?"var(--accent)":"var(--text-muted)",fontWeight:isToday?700:400}}>{new Date(d).toLocaleDateString("en",{weekday:"short"}).slice(0,2)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── PROFILE SELECTOR ────────────────────────────────────────────────────────
function ProfileSelector({profiles, activeProfileId, setActiveProfileId, addProfile, deleteProfile, renameProfile}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState('');
  const active = profiles.find(p=>p.id===activeProfileId) || profiles[0];
  return (
    <div style={{marginBottom:16}}>
      <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
        {profiles.map(p=>(
          <div key={p.id} style={{display:'flex',alignItems:'center',gap:3}}>
            {editing===p.id
              ? <input value={editName} onChange={e=>setEditName(e.target.value)} autoFocus
                  onKeyDown={e=>{if(e.key==='Enter'){renameProfile(p.id,editName.trim()||p.name);setEditing(null);}if(e.key==='Escape')setEditing(null);}}
                  style={{...IS,height:30,padding:'0 8px',fontSize:12,width:90}}/>
              : <button onClick={()=>setActiveProfileId(p.id)}
                  style={{...CB,background:activeProfileId===p.id?'var(--accent)':'var(--bg-card)',color:activeProfileId===p.id?'#fff':'var(--text-sub)',boxShadow:activeProfileId===p.id?'var(--nm-inset)':'var(--nm-raised-sm)',fontWeight:activeProfileId===p.id?700:400,fontSize:13,padding:'6px 14px'}}>
                  👤 {p.name}
                </button>
            }
            {activeProfileId===p.id && editing!==p.id && (
              <button onClick={()=>{setEditing(p.id);setEditName(p.name);}} style={{...GB,padding:'3px 6px',fontSize:11,color:'var(--text-muted)'}} title="Rename">✏️</button>
            )}
          </div>
        ))}
        {adding
          ? <div style={{display:'flex',gap:5,alignItems:'center'}}>
              <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Name…" autoFocus
                onKeyDown={e=>{if(e.key==='Enter'&&newName.trim()){addProfile(newName.trim());setAdding(false);setNewName('');}if(e.key==='Escape')setAdding(false);}}
                style={{...IS,height:30,padding:'0 8px',fontSize:12,width:90}}/>
              <button onClick={()=>{if(newName.trim()){addProfile(newName.trim());setAdding(false);setNewName('');}}} style={{...GB,padding:'4px 10px',fontSize:12,color:'var(--accent)',fontWeight:700}}>✓</button>
              <button onClick={()=>{setAdding(false);setNewName('');}} style={{...GB,padding:'4px 8px',fontSize:12}}>✕</button>
            </div>
          : <button onClick={()=>setAdding(true)} style={{...GB,padding:'6px 12px',fontSize:12,color:'var(--text-muted)'}}>+ Add Person</button>
        }
      </div>
      {profiles.length>1 && (
        <button onClick={()=>deleteProfile(activeProfileId)} style={{marginTop:6,color:'#f08080',background:'none',border:'none',fontSize:11,cursor:'pointer',padding:0}}>
          Remove {active?.name}
        </button>
      )}
    </div>
  );
}

// ─── STATISTICS PANEL ────────────────────────────────────────────────────────
function StatisticsPanel({recipes, mealPlanItems, ratings, favorites, shoppingSpends, cookLog, macroGoals, setMacroGoals, onDeleteSpend, profileSelector}) {
  const [editingGoals, setEditingGoals] = useState(false);
  const [goalDraft, setGoalDraft] = useState(macroGoals||{calories:2000,protein:50,carbs:130,fat:65});
  const totalRecipes = recipes.length;
  const avgCookTime = totalRecipes ? Math.round(recipes.reduce((s,r)=>s+(r.cookTime||0),0)/totalRecipes) : 0;
  const avgCalories = totalRecipes ? Math.round(recipes.reduce((s,r)=>s+(r.nutrition?.calories||0),0)/totalRecipes) : 0;
  const avgProtein = totalRecipes ? Math.round(recipes.reduce((s,r)=>s+(r.nutrition?.protein||0),0)/totalRecipes) : 0;
  const avgCarbs = totalRecipes ? Math.round(recipes.reduce((s,r)=>s+(r.nutrition?.carbs||0),0)/totalRecipes) : 0;
  const avgFat = totalRecipes ? Math.round(recipes.reduce((s,r)=>s+(r.nutrition?.fat||0),0)/totalRecipes) : 0;

  const catBreakdown = CATEGORIES.filter(c=>c.id!=="all").map(c=>({...c,count:recipes.filter(r=>r.category===c.id).length}));
  const maxCat = Math.max(...catBreakdown.map(c=>c.count),1);

  const tagCounts = {};
  recipes.forEach(r=>(r.tags||[]).forEach(t=>{tagCounts[t]=(tagCounts[t]||0)+1;}));
  const topTags = Object.entries(tagCounts).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const maxTag = Math.max(...topTags.map(([,c])=>c),1);

  const spiceDist = [0,1,2,3,4,5].map(lvl=>({lvl,count:recipes.filter(r=>(r.spiceLevel||0)===lvl).length}));

  const ratedRecipes = Object.entries(ratings).map(([id,rt])=>({
    recipe:recipes.find(x=>x.id===Number(id)), rt
  })).filter(x=>x.recipe).sort((a,b)=>(b.rt.taste||0)-(a.rt.taste||0));

  const totalSpend = (shoppingSpends||[]).reduce((s,x)=>s+(x.amount||0),0);
  const avgSpend = (shoppingSpends||[]).length ? totalSpend/(shoppingSpends||[]).length : 0;

  const cuisineBreakdown = CUISINES.map(c=>({c,count:recipes.filter(r=>r.cuisine===c).length})).filter(x=>x.count>0);
  const maxCuisine = Math.max(...cuisineBreakdown.map(x=>x.count),1);

  const plannedCalories = mealPlanItems.reduce((s,i)=>s+(i.nutrition?.calories||0),0);
  const plannedProtein = mealPlanItems.reduce((s,i)=>s+(i.nutrition?.protein||0),0);

  const StatCard = ({icon,value,label,color="#5aad8e",sub}) => (
    <div style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised)",borderRadius:16,padding:"16px 14px",minWidth:0}}>
      <div style={{fontSize:22,marginBottom:6}}>{icon}</div>
      <div style={{color,fontWeight:800,fontSize:26,lineHeight:1}}>{value}</div>
      <div style={{color:"var(--text-muted)",fontSize:11,marginTop:3,textTransform:"uppercase",letterSpacing:.5}}>{label}</div>
      {sub && <div style={{color:"var(--text-sub)",fontSize:11,marginTop:4}}>{sub}</div>}
    </div>
  );

  const Bar = ({pct,color}) => (
    <div style={{height:8,background:"var(--nm-input-bg)",borderRadius:4,overflow:"hidden",boxShadow:"var(--nm-inset)"}}>
      <div style={{height:"100%",width:pct+"%",background:color,borderRadius:4,transition:"width .5s"}}/>
    </div>
  );

  return (
    <div>
      <h2 style={{color:"var(--text)",fontFamily:"'Playfair Display',serif",marginBottom:4}}>📊 Statistics</h2>
      <p style={{color:"var(--text-sub)",fontSize:13,marginBottom:14}}>Your meal prep insights at a glance</p>
      {profileSelector}

      {/* Summary cards */}
      <div className="r-grid-sm" style={{marginBottom:24}}>
        {(()=>{
          let streak=0;const d=new Date();
          while(true){const ds=d.toDateString();if(!(cookLog||[]).some(l=>new Date(l.date).toDateString()===ds))break;streak++;d.setDate(d.getDate()-1);}
          return <StatCard icon="🔥" value={streak} label="Cook Streak" color="#ffd580" sub={`${(cookLog||[]).length} total sessions`}/>;
        })()}
        <StatCard icon="📖" value={totalRecipes} label="Total Recipes" color="#5a8fd4"/>
        <StatCard icon="⏱" value={avgCookTime+"m"} label="Avg Cook Time" color="#d4875a"/>
        <StatCard icon="📅" value={mealPlanItems.length} label="Meals Planned" color="#5aad8e"/>
        <StatCard icon="💰" value={"$"+totalSpend.toFixed(2)} label="Total Spent" color="#c06090" sub={`${(shoppingSpends||[]).length} trips · avg $${avgSpend.toFixed(2)}`}/>
        <StatCard icon="♥" value={favorites.length} label="Favorites" color="#e05a6a"/>
        <StatCard icon="⭐" value={ratedRecipes.length} label="Rated" color="#ffd580"/>
      </div>

      {/* Macro Goals Editor */}
      <div style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised)",borderRadius:16,padding:"18px 16px",marginBottom:24}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:editingGoals?14:0}}>
          <div style={{color:"var(--text)",fontWeight:700,fontSize:13}}>🎯 Daily Macro Goals</div>
          <button onClick={()=>{if(editingGoals){setMacroGoals(goalDraft);}setEditingGoals(e=>!e);}} style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised-sm)",border:"none",borderRadius:8,color:editingGoals?"var(--accent)":"var(--text-sub)",padding:"4px 10px",fontSize:12,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>
            {editingGoals?"✓ Save":"✏️ Edit"}
          </button>
        </div>
        {editingGoals ? (
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
            {[["🔥 Cal",goalDraft.calories,"calories","kcal"],["💪 Protein",goalDraft.protein,"protein","g"],["🌾 Carbs",goalDraft.carbs,"carbs","g"],["🥑 Fat",goalDraft.fat,"fat","g"]].map(([l,v,k,u])=>(
              <div key={k}>
                <div style={{color:"var(--text-muted)",fontSize:10,marginBottom:4}}>{l} ({u})</div>
                <input type="number" value={v} onChange={e=>setGoalDraft(d=>({...d,[k]:+e.target.value}))}
                  style={{background:"var(--nm-input-bg)",boxShadow:"var(--nm-inset)",border:"none",borderRadius:8,color:"var(--text)",padding:"6px 10px",fontSize:14,outline:"none",width:"100%",boxSizing:"border-box",fontFamily:"inherit"}}/>
              </div>
            ))}
          </div>
        ) : (
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:10}}>
            {[["🔥",macroGoals?.calories,"kcal","#e05a6a"],["💪",macroGoals?.protein,"g protein","#5aad8e"],["🌾",macroGoals?.carbs,"g carbs","#5a8fd4"],["🥑",macroGoals?.fat,"g fat","#d4875a"]].map(([ico,v,u,col])=>(
              <span key={u} style={{background:"var(--nm-input-bg)",boxShadow:"var(--nm-inset)",borderRadius:20,padding:"4px 12px",fontSize:12,color:col,fontWeight:700}}>{ico} {v}{u}</span>
            ))}
          </div>
        )}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,marginBottom:24}}>
        {/* Category breakdown */}
        <div style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised)",borderRadius:16,padding:"18px 16px"}}>
          <div style={{color:"var(--text)",fontWeight:700,fontSize:13,marginBottom:14}}>📂 Recipes by Category</div>
          {catBreakdown.map(c=>(
            <div key={c.id} style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4,fontSize:12}}>
                <span style={{color:"var(--text-sub)"}}>{c.icon} {c.label}</span>
                <span style={{color:"var(--accent)",fontWeight:700}}>{c.count}</span>
              </div>
              <Bar pct={maxCat?c.count/maxCat*100:0} color="var(--accent)"/>
            </div>
          ))}
        </div>

        {/* Nutrition averages */}
        <div style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised)",borderRadius:16,padding:"18px 16px"}}>
          <div style={{color:"var(--text)",fontWeight:700,fontSize:13,marginBottom:14}}>🥗 Avg Nutrition / Recipe</div>
          {[["🔥 Calories",avgCalories,"kcal","#e05a6a",2000],["💪 Protein",avgProtein,"g","#5aad8e",50],["🌾 Carbs",avgCarbs,"g","#5a8fd4",130],["🥑 Fat",avgFat,"g","#d4875a",65]].map(([l,v,u,col,max])=>(
            <div key={l} style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4,fontSize:12}}>
                <span style={{color:"var(--text-sub)"}}>{l}</span>
                <span style={{color:col,fontWeight:700}}>{v}{u}</span>
              </div>
              <Bar pct={Math.min(v/max*100,100)} color={col}/>
            </div>
          ))}
          {mealPlanItems.length>0 && (
            <div style={{marginTop:14,paddingTop:12,borderTop:"1px solid var(--border)"}}>
              <div style={{color:"var(--text-muted)",fontSize:11,marginBottom:6}}>📅 Planned meals total</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {[["🔥",plannedCalories,"kcal"],["💪",plannedProtein,"g protein"]].map(([ico,v,u])=>(
                  <span key={u} style={{background:"var(--nm-input-bg)",boxShadow:"var(--nm-inset)",borderRadius:20,padding:"3px 10px",fontSize:11,color:"var(--text-sub)"}}>{ico} {v}{u}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,marginBottom:24}}>
        {/* Top tags */}
        <div style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised)",borderRadius:16,padding:"18px 16px"}}>
          <div style={{color:"var(--text)",fontWeight:700,fontSize:13,marginBottom:14}}>🏷️ Most Used Tags</div>
          {topTags.length===0 && <div style={{color:"var(--text-muted)",fontSize:12}}>No tags yet</div>}
          {topTags.map(([tag,count])=>(
            <div key={tag} style={{marginBottom:9}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:3,fontSize:12}}>
                <span style={{color:ALL_TAG_COLORS[tag]||"var(--text-sub)"}}>{tag}</span>
                <span style={{color:"var(--text-muted)"}}>{count} recipes</span>
              </div>
              <Bar pct={count/maxTag*100} color={ALL_TAG_COLORS[tag]||"var(--accent)"}/>
            </div>
          ))}
        </div>

        {/* Spice distribution */}
        <div style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised)",borderRadius:16,padding:"18px 16px"}}>
          <div style={{color:"var(--text)",fontWeight:700,fontSize:13,marginBottom:14}}>🌶️ Spice Distribution</div>
          {spiceDist.map(({lvl,count})=>(
            <div key={lvl} style={{marginBottom:9}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:3,fontSize:12}}>
                <span style={{color:"var(--text-sub)"}}>{lvl===0?"⚪ No Spice":"🌶".repeat(lvl)+" "+SPICE_LABELS[lvl]}</span>
                <span style={{color:"var(--text-muted)"}}>{count}</span>
              </div>
              <Bar pct={totalRecipes?count/totalRecipes*100:0} color={lvl===0?"var(--text-muted)":"hsl("+(30-lvl*8)+",80%,"+(60-lvl*5)+"%)"}/>
            </div>
          ))}
        </div>
      </div>

      {/* Cuisine breakdown */}
      {cuisineBreakdown.length>0 && (
        <div style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised)",borderRadius:16,padding:"18px 16px",marginBottom:24}}>
          <div style={{color:"var(--text)",fontWeight:700,fontSize:13,marginBottom:14}}>🌍 Recipes by Cuisine</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:10}}>
            {cuisineBreakdown.map(({c,count})=>(
              <div key={c} style={{background:"var(--nm-input-bg)",boxShadow:"var(--nm-inset)",borderRadius:10,padding:"10px 12px"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:6,fontSize:12}}>
                  <span style={{color:CUISINE_COLORS[c]||"var(--text-sub)",fontWeight:700}}>🌍 {c}</span>
                  <span style={{color:"var(--text-muted)"}}>{count}</span>
                </div>
                <div style={{height:5,background:"var(--border)",borderRadius:3,overflow:"hidden"}}>
                  <div style={{height:"100%",width:count/maxCuisine*100+"%",background:CUISINE_COLORS[c]||"var(--accent)",borderRadius:3}}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cooking log */}
      {(cookLog||[]).length>0 && (
        <div style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised)",borderRadius:16,padding:"18px 16px",marginBottom:24}}>
          <div style={{color:"var(--text)",fontWeight:700,fontSize:13,marginBottom:14}}>🍳 Recent Cooking Sessions</div>
          {(cookLog||[]).slice().reverse().slice(0,8).map(l=>(
            <div key={l.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:"1px solid var(--border)",fontSize:12}}>
              <span style={{fontSize:18}}>🍳</span>
              <span style={{flex:1,color:"var(--text)"}}>{l.recipeName}</span>
              <span style={{color:"var(--text-muted)"}}>{new Date(l.date).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>
            </div>
          ))}
        </div>
      )}

      {/* Top rated */}
      {ratedRecipes.length>0 && (
        <div style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised)",borderRadius:16,padding:"18px 16px",marginBottom:24}}>
          <div style={{color:"var(--text)",fontWeight:700,fontSize:13,marginBottom:14}}>⭐ Top Rated Recipes</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10}}>
            {ratedRecipes.slice(0,6).map(({recipe,rt})=>(
              <div key={recipe.id} style={{background:"var(--nm-input-bg)",boxShadow:"var(--nm-inset)",borderRadius:12,padding:"10px 12px"}}>
                <div style={{color:"var(--text)",fontSize:13,fontWeight:600,marginBottom:4}}>{recipe.title}</div>
                <div style={{display:"flex",gap:8,fontSize:11,flexWrap:"wrap"}}>
                  {rt.taste && <span style={{color:"#ffd580"}}>⭐ {rt.taste}/5 taste</span>}
                  {rt.difficulty && <span style={{color:"#5a8fd4"}}>💪 {rt.difficulty}/5 ease</span>}
                  {rt.spice && <span style={{color:"#e05050"}}>🌶 {rt.spice}/5</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Spending history */}
      {(shoppingSpends||[]).length>0 && (
        <div style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised)",borderRadius:16,padding:"18px 16px",marginBottom:24}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{color:"var(--text)",fontWeight:700,fontSize:13}}>💰 Shopping Spend History</div>
            <span style={{color:"var(--accent)",fontWeight:700,fontSize:14}}>${totalSpend.toFixed(2)} total</span>
          </div>
          {(shoppingSpends||[]).slice().reverse().map(s=>(
            <div key={s.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid var(--border)"}}>
              <span style={{fontSize:18}}>🛒</span>
              <div style={{flex:1}}>
                <div style={{color:"var(--text)",fontSize:13}}>{s.note}</div>
                <div style={{color:"var(--text-muted)",fontSize:11}}>{new Date(s.date).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</div>
              </div>
              <span style={{color:"var(--accent)",fontWeight:700,fontSize:15}}>${s.amount.toFixed(2)}</span>
              <button onClick={()=>onDeleteSpend?.(s.id)} style={{background:"none",border:"none",color:"var(--text-muted)",fontSize:14,cursor:"pointer",padding:"0 4px"}} title="Delete">×</button>
            </div>
          ))}
          <div style={{marginTop:12,display:"flex",gap:16,fontSize:12,color:"var(--text-sub)"}}>
            <span>📈 Avg per trip: <strong style={{color:"var(--text)"}}>${avgSpend.toFixed(2)}</strong></span>
            <span>🧾 {(shoppingSpends||[]).length} trips logged</span>
          </div>
        </div>
      )}

      {totalRecipes===0 && (
        <div style={{textAlign:"center",padding:"40px 0",color:"var(--text-muted)"}}>
          <div style={{fontSize:40,marginBottom:10}}>📊</div>
          <div style={{fontSize:14}}>Add recipes to see your stats</div>
        </div>
      )}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
function App() {
  const [recipes, setRecipes] = useState(SAMPLE_RECIPES);
  const [sec, setSec] = useState("dashboard");
  const [catF, setCatF] = useState("all");
  const [tagF, setTagF] = useState(null);
  const [healthF, setHealthF] = useState(null);
  const [goalF, setGoalF] = useState(null);
  const [cuisineF, setCuisineF] = useState(null);
  const [search, setSearch] = useState("");
  const [viewing, setViewing] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [sidebar, setSidebar] = useState(true);
  const [favorites, setFavorites] = useState([]);
  const [mealPlanItems, setMealPlanItems] = useState([]);
  const [ratings, setRatings] = useState({});
  const [ratingTarget, setRatingTarget] = useState(null);
  const [shoppingSpends, setShoppingSpends] = useState([]);
  const [profiles, setProfiles] = useState([{id:'default',name:'Me',macroGoals:{calories:2000,protein:50,carbs:130,fat:65},cookLog:[],supplements:[]}]);
  const [activeProfileId, setActiveProfileId] = useState('default');
  const activeProfile = profiles.find(p=>p.id===activeProfileId) || profiles[0];
  const macroGoals = activeProfile?.macroGoals || {calories:2000,protein:50,carbs:130,fat:65};
  const cookLog = activeProfile?.cookLog || [];
  const supplements = activeProfile?.supplements || [];
  const setMacroGoals = v => setProfiles(ps=>ps.map(p=>p.id===activeProfileId?{...p,macroGoals:typeof v==='function'?v(p.macroGoals):v}:p));
  const setCookLog = v => setProfiles(ps=>ps.map(p=>p.id===activeProfileId?{...p,cookLog:typeof v==='function'?v(p.cookLog):v}:p));
  const setSupplements = v => setProfiles(ps=>ps.map(p=>p.id===activeProfileId?{...p,supplements:typeof v==='function'?v(p.supplements):v}:p));
  const addProfile = name => { const id='p_'+Date.now(); setProfiles(ps=>[...ps,{id,name,macroGoals:{calories:2000,protein:50,carbs:130,fat:65},cookLog:[],supplements:[]}]); setActiveProfileId(id); };
  const deleteProfile = id => { if(profiles.length<=1) return; const rest=profiles.filter(p=>p.id!==id); setProfiles(rest); if(activeProfileId===id) setActiveProfileId(rest[0].id); };
  const renameProfile = (id,name) => setProfiles(ps=>ps.map(p=>p.id===id?{...p,name}:p));
  const [pexelsKey, setPexelsKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tipIdx, setTipIdx] = useState(0);
  const [darkMode, setDarkMode] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachMsgs, setCoachMsgs] = useState([{role:"assistant",content:"Hi! I'm your Meal Coach 👋 Ask me anything about your recipes, nutrition, or meal planning!"}]);
  const [coachInput, setCoachInput] = useState("");
  const [coachLoading, setCoachLoading] = useState(false);
  // Filters
  const [diffF, setDiffF] = useState(null);
  const [maxTimeF, setMaxTimeF] = useState(null);
  const [maxCostF, setMaxCostF] = useState(null);
  // Budget mode
  const [budgetMode, setBudgetMode] = useState(false);
  const [weeklyBudget, setWeeklyBudget] = useState(100);

  // Supabase sync state
  const [supaUser, setSupaUser] = useState(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authOTP, setAuthOTP] = useState('');
  const [authStep, setAuthStep] = useState('idle'); // 'idle'|'sending'|'sent'|'verifying'|'done'
  const [authError, setAuthError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const saveTimerRef = useRef(null);
  const supabaseRef = useRef(null);
  const getSupabase = () => {
    if (!supabaseRef.current) {
      try {
        supabaseRef.current = createClient(SUPABASE_URL, SUPABASE_KEY, {
          auth: {
            // Use cookie-aware storage so iOS home screen apps keep their session
            storage: supaStorage,
            persistSession: true,
            autoRefreshToken: true,
          }
        });
      } catch(e) { console.warn('Supabase init failed', e); }
    }
    return supabaseRef.current;
  };

  // Supabase helpers
  const loadFromSupabase = async (user, forceReplace = false) => {
    if (!user) return;
    setSyncing(true);
    try {
      const { data } = await getSupabase()?.from('user_data').select('data').eq('user_id', user.id).single();
      if (data?.data) {
        const d = JSON.parse(data.data);
        if (d.recipes) setRecipes(local => {
          if (forceReplace) {
            return d.recipes.map(r => {
              const localR = local.find(x => x.id === r.id);
              return {
                ...r,
                image: r.image || localR?.image || null,
                ingredientsImage: r.ingredientsImage || localR?.ingredientsImage || null,
                steps: (r.steps||[]).map((s,i) => ({...s, image: s.image || localR?.steps?.[i]?.image || null})),
                ingredients: (r.ingredients||[]).map((ing,i) => ({...ing, image: ing.image || localR?.ingredients?.[i]?.image || null})),
              };
            }).concat(local.filter(x => !d.recipes.some(r => r.id === x.id)));
          }
          return d.recipes.map(r => {
            const localR = local.find(x => x.id === r.id);
            return localR ? {...localR, ...r, image: r.image || localR.image, ingredientsImage: r.ingredientsImage || localR.ingredientsImage} : r;
          }).concat(local.filter(x => !d.recipes.some(r => r.id === x.id)));
        });
        if (d.favorites) setFavorites(local => {
          const merged = [...local];
          for (const f of d.favorites) {
            if (!merged.some(x => x.id === f.id)) merged.push(f);
          }
          return merged;
        });
        if (d.mealPlanItems) setMealPlanItems(local => {
          const merged = [...local];
          for (const m of d.mealPlanItems) {
            if (!merged.some(x => x.id === m.id)) merged.push(m);
          }
          return merged;
        });
        if (d.ratings) setRatings(local => ({...d.ratings, ...local}));
        if (d.anthropicKey) { setAnthropicKey(d.anthropicKey); pwaSet('anthropic_key', d.anthropicKey); }
        if (d.pexelsKey) { setPexelsKey(d.pexelsKey); pwaSet('pexels_key', d.pexelsKey); }
        if (d.shoppingSpends) setShoppingSpends(d.shoppingSpends);
        if (d.profiles && Array.isArray(d.profiles) && d.profiles.length > 0) {
          const sanitized = d.profiles.map(sanitizeProfile);
          setProfiles(sanitized);
          setActiveProfileId(id => sanitized.some(p => p.id === id) ? id : sanitized[0].id);
        } else if (d.cookLog || d.supplements || d.macroGoals) {
          // Migrate old format into default profile
          setProfiles(ps => ps.map(p => p.id==='default' ? {
            ...p,
            ...(d.macroGoals && {macroGoals:d.macroGoals}),
            ...(d.cookLog && {cookLog:d.cookLog}),
            ...(d.supplements && {supplements:d.supplements}),
          } : p));
        }
        setSyncing(false); // ← was missing — spinner never stopped on success
        return d;
      }
    } catch(e) { console.error('loadFromSupabase error', e); }
    setSyncing(false);
  };

  const sendOTP = async () => {
    if (!authEmail.trim()) return;
    setAuthStep('sending'); setAuthError('');
    // No emailRedirectTo = Supabase sends a 6-digit OTP code instead of a magic link.
    // Requires "Email OTP" enabled in Supabase Dashboard → Authentication → Providers → Email.
    const { error } = await getSupabase()?.auth.signInWithOtp({
      email: authEmail.trim(),
      options: { shouldCreateUser: true }
    });
    if (error) { setAuthError(error.message); setAuthStep('idle'); }
    else setAuthStep('sent');
  };

  const verifyOTP = async () => {
    if (!authOTP.trim()) return;
    setAuthStep('verifying'); setAuthError('');
    const { data, error } = await getSupabase()?.auth.verifyOtp({ email: authEmail, token: authOTP.trim(), type: 'email' });
    if (error) { setAuthError(error.message); setAuthStep('sent'); }
    else { setSupaUser(data.user); setAuthStep('done'); await loadFromSupabase(data.user); }
  };

  const supaSignOut = async () => {
    await getSupabase()?.auth.signOut();
    setSupaUser(null); setAuthStep('idle'); setAuthEmail(''); setAuthOTP(''); setAuthError('');
  };

  // Load all persisted data on mount
  useEffect(() => {
    // Handle shared recipe URL
    try {
      const params = new URLSearchParams(window.location.search);
      const encoded = params.get("recipe");
      if(encoded) {
        const r = JSON.parse(decodeURIComponent(atob(encoded)));
        if(r && r.title) {
          r.id = Date.now();
          setRecipes(p=>p.some(x=>x.title===r.title)?p:[...p,r]);
        }
        window.history.replaceState({},"",window.location.pathname);
      }
    } catch(e){}
    // Load from localStorage first
    try {
      const saved = localStorage.getItem('mpm_recipes');
      if (saved) setRecipes(JSON.parse(saved));
      const favs = localStorage.getItem('mpm_favorites');
      if (favs) setFavorites(JSON.parse(favs));
      const plan = localStorage.getItem('mpm_mealplan');
      if (plan) setMealPlanItems(JSON.parse(plan));
      const rats = localStorage.getItem('mpm_ratings');
      if (rats) setRatings(JSON.parse(rats));
      const spends = localStorage.getItem('mpm_spends');
      if (spends) setShoppingSpends(JSON.parse(spends));
      const savedProfiles = localStorage.getItem('mpm_profiles');
      if (savedProfiles) {
        const parsed = JSON.parse(savedProfiles);
        const sanitized = Array.isArray(parsed) && parsed.length > 0 ? parsed.map(sanitizeProfile) : [{id:'default',name:'Me',macroGoals:{calories:2000,protein:50,carbs:130,fat:65},cookLog:[],supplements:[]}];
        setProfiles(sanitized);
        const savedActive = localStorage.getItem('mpm_active_profile');
        if (savedActive && sanitized.some(p => p.id === savedActive)) setActiveProfileId(savedActive);
        else setActiveProfileId(sanitized[0].id);
      } else {
        // Migrate from old separate keys into default profile
        const def = {id:'default',name:'Me',macroGoals:{calories:2000,protein:50,carbs:130,fat:65},cookLog:[],supplements:[]};
        const goals = localStorage.getItem('mpm_macro_goals'); if (goals) def.macroGoals = JSON.parse(goals);
        const cl = localStorage.getItem('mpm_cook_log'); if (cl) def.cookLog = JSON.parse(cl);
        const sups = localStorage.getItem('mpm_supplements'); if (sups) def.supplements = JSON.parse(sups);
        setProfiles([def]);
      }
    } catch(e) {}
    setAnthropicKey(pwaGet('anthropic_key') || '');
    setPexelsKey(pwaGet('pexels_key') || '');
    setDarkMode(localStorage.getItem('dark_mode') !== 'false');
    setHydrated(true);
    const check = () => { const m = window.innerWidth < 768; setIsMobile(m); if(m) setSidebar(false); };
    check();
    window.addEventListener('resize', check);
    // Check for existing Supabase session
    const sb = getSupabase();
    if (sb) {
      sb.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          setSupaUser(session.user);
          setAuthStep('done');
          loadFromSupabase(session.user);
        }
      }).catch(()=>{});
      const authSub = sb.auth.onAuthStateChange((_event, session) => {
        if (session?.user) { setSupaUser(session.user); setAuthStep('done'); }
        else { setSupaUser(null); setAuthStep('idle'); }
      });
      const subscription = authSub?.data?.subscription;
      return () => { window.removeEventListener('resize', check); subscription?.unsubscribe(); };
    }
    return () => window.removeEventListener('resize', check);
  }, []);

  // Persist data whenever it changes (skip before hydration to avoid overwriting with defaults)
  useEffect(() => { if (hydrated) lsSave('mpm_recipes', recipes); }, [recipes, hydrated]);
  useEffect(() => { if (hydrated) lsSave('mpm_favorites', favorites); }, [favorites, hydrated]);
  useEffect(() => { if (hydrated) lsSave('mpm_mealplan', mealPlanItems); }, [mealPlanItems, hydrated]);
  useEffect(() => { if (hydrated) lsSave('mpm_ratings', ratings); }, [ratings, hydrated]);
  useEffect(() => { if (hydrated) lsSave('mpm_spends', shoppingSpends); }, [shoppingSpends, hydrated]);
  useEffect(() => { if (hydrated) lsSave('mpm_profiles', profiles); }, [profiles, hydrated]);
  useEffect(() => { if (hydrated) lsSave('mpm_active_profile', activeProfileId); }, [activeProfileId, hydrated]);

  // Canvas compress fallback (for when storage upload is unavailable)
  const compressImageCanvas = (base64) => new Promise(resolve => {
    if (!base64?.startsWith('data:')) { resolve(base64); return; }
    const img = new Image();
    img.onload = () => {
      const MAX = 800;
      const scale = img.width > MAX ? MAX / img.width : 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = () => resolve(null);
    img.src = base64;
  });

  // Upload a base64 image to Supabase Storage, returns public URL.
  // Falls back to canvas compression if storage is unavailable.
  const uploadImageToStorage = async (base64, storagePath) => {
    if (!base64?.startsWith('data:')) return base64; // already a URL or null/undefined
    const sb = getSupabase();
    if (!sb || !supaUser) return compressImageCanvas(base64);
    try {
      const res = await fetch(base64);
      const blob = await res.blob();
      const ext = blob.type === 'image/png' ? 'png' : 'jpg';
      const path = `${supaUser.id}/${storagePath}.${ext}`;
      const { error } = await sb.storage.from('recipe-images').upload(path, blob, { upsert: true, contentType: blob.type });
      if (error) throw error;
      const { data } = sb.storage.from('recipe-images').getPublicUrl(path);
      return data.publicUrl;
    } catch(e) {
      console.warn('Storage upload failed, using compression fallback:', e.message);
      return compressImageCanvas(base64);
    }
  };

  // Prepare recipes for sync — upload base64 images to Storage (returns public URLs)
  const prepareRecipesForSync = async (recipeList) => {
    return Promise.all(recipeList.map(async r => ({
      ...r,
      image: await uploadImageToStorage(r.image, `${r.id}/cover`),
      ingredientsImage: await uploadImageToStorage(r.ingredientsImage, `${r.id}/ingredients`),
      steps: await Promise.all((r.steps||[]).map(async (s,i) => ({...s, image: await uploadImageToStorage(s.image, `${r.id}/step-${i}`)}))),
      ingredients: await Promise.all((r.ingredients||[]).map(async (ing,i) => ({...ing, image: await uploadImageToStorage(ing.image, `${r.id}/ingredient-${i}`)}))),
    })));
  };

  // Auto-save to Supabase whenever data changes (debounced 2s)
  useEffect(() => {
    if (!hydrated || !supaUser) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSyncing(true);
      try {
        const syncedRecipes = await prepareRecipesForSync(recipes);
        // Merge with cloud to avoid last-write-wins overwriting recipes added on other devices.
        let mergedRecipes = syncedRecipes;
        try {
          const { data: cloudRow } = await getSupabase()?.from('user_data').select('data').eq('user_id', supaUser.id).single();
          if (cloudRow?.data) {
            const cloudRecipes = JSON.parse(cloudRow.data).recipes || [];
            const cloudOnly = cloudRecipes.filter(cr => !syncedRecipes.some(lr => lr.id === cr.id));
            if (cloudOnly.length > 0) mergedRecipes = [...syncedRecipes, ...cloudOnly];
          }
        } catch(fetchErr) { /* proceed with local only if cloud fetch fails */ }
        const { error } = await getSupabase()?.from('user_data').upsert({
          user_id: supaUser.id,
          data: JSON.stringify({ recipes: mergedRecipes, favorites, mealPlanItems, ratings, anthropicKey, pexelsKey, shoppingSpends, profiles }),
          updated_at: new Date().toISOString()
        });
        if (error) { console.error('Auto-save failed:', error.message); setSyncError(error.message); }
        else setSyncError('');
      } catch(e) { console.error('Auto-save error:', e); setSyncError(e.message); }
      setSyncing(false);
    }, 2000);
    return () => clearTimeout(saveTimerRef.current);
  }, [recipes, favorites, mealPlanItems, ratings, anthropicKey, pexelsKey, shoppingSpends, profiles, hydrated, supaUser]);

  useEffect(() => {
    const iv = setInterval(()=>setTipIdx(i=>(i+1)%4), 5000);
    return () => clearInterval(iv);
  }, []);

  const filtered = recipes.filter(r => {
    if (catF!=="all" && r.category!==catF) return false;
    if (tagF && !(r.tags||[]).includes(tagF)) return false;
    if (healthF && !(r.tags||[]).includes(healthF)) return false;
    if (goalF && !(r.goal||[]).some(g=>(g||"").toLowerCase()===goalF.toLowerCase())) return false;
    if (cuisineF && r.cuisine!==cuisineF) return false;
    if (diffF && (r.difficulty||"beginner")!==diffF) return false;
    if (maxTimeF !== null && (r.totalTime||(r.prepTime||0)+(r.cookTime||0)) > maxTimeF) return false;
    if (maxCostF !== null && recipeEstCost(r) > maxCostF) return false;
    if (search && !(r.title||"").toLowerCase().includes(search.toLowerCase()) &&
        !(r.ingredients||[]).some(i=>(i.name||"").toLowerCase().includes(search.toLowerCase()))) return false;
    return true;
  });
  const anyFilterActive = catF!=="all" || tagF || healthF || goalF || cuisineF || diffF || maxTimeF !== null || maxCostF !== null || search;
  const clearAllFilters = () => { setCatF("all"); setTagF(null); setHealthF(null); setGoalF(null); setCuisineF(null); setDiffF(null); setMaxTimeF(null); setMaxCostF(null); setSearch(""); };

  const navItems = [
    {id:"dashboard",label:"Dashboard",icon:"🏠"},
    {id:"recipes",label:"Recipes",icon:"📖"},
    {id:"mix-match",label:"Mix & Match",icon:"🔀"},
    {id:"meal-plan",label:"Meal Plan",icon:"📅"},
    {id:"shopping",label:"Shopping List",icon:"🛒"},
    {id:"optimizer",label:"Optimizer",icon:"⚡"},
    {id:"ingredient-search",label:"Ingredients",icon:"🔍"},
    {id:"favorites",label:"Favorites",icon:"♥"},
    {id:"gallery",label:"Gallery",icon:"📸"},
    {id:"supplements",label:"Supplements",icon:"💊"},
    {id:"statistics",label:"Statistics",icon:"📊"},
  ];

  const toggleFav = r => setFavorites(p=>p.some(f=>f.id===r.id)?p.filter(f=>f.id!==r.id):[...p,{id:r.id}]);
  const isFav = r => favorites.some(f=>f.id===r.id);

  const toggleDark = () => setDarkMode(d => { const nd = !d; if(typeof localStorage!=='undefined') localStorage.setItem('dark_mode',String(nd)); return nd; });

  const sendCoach = async () => {
    if(!coachInput.trim()||coachLoading) return;
    const msg = coachInput.trim();
    setCoachInput("");
    setCoachMsgs(p=>[...p,{role:"user",content:msg}]);
    setCoachLoading(true);
    try {
      const ctx = `User has ${recipes.length} recipes: ${recipes.slice(0,5).map(r=>r.title).join(", ")}. Meal plan has ${mealPlanItems.length} items.`;
      const reply = await anthropicCall({max_tokens:500, system:"You are a friendly meal prep and nutrition coach. Keep answers concise (2-4 sentences). Context: "+ctx, messages:[...coachMsgs.filter(m=>m.role==="user").slice(-4),{role:"user",content:msg}]});
      setCoachMsgs(p=>[...p,{role:"assistant",content:reply}]);
    } catch(e){
      const msg = e.message === "LOW_CREDITS" ? "Your Anthropic API credits are too low — go to console.anthropic.com → Billing to top up."
        : e.message === "NO_KEY" ? "No API key set — click ⚙️ in the topbar to add your Anthropic key."
        : e.message === "INVALID_KEY" ? "Invalid API key — click ⚙️ to re-enter it."
        : "Sorry, I couldn't connect. Check your API key.";
      setCoachMsgs(p=>[...p,{role:"assistant",content:msg}]);
    }
    setCoachLoading(false);
  };

  const exportData = () => {
    const data = {recipes, favorites, mealPlanItems, ratings, version:1};
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));
    a.download = "mealprepmaster-backup.json"; a.click();
  };
  const importData = e => {
    const f = e.target.files?.[0]; if(!f) return;
    const rd = new FileReader();
    rd.onload = ev => {
      try {
        const d = JSON.parse(ev.target.result);
        if(d.recipes) setRecipes(p=>[...p,...d.recipes.filter(r=>!p.some(x=>x.id===r.id))]);
        if(d.favorites) setFavorites(d.favorites);
        if(d.mealPlanItems) setMealPlanItems(d.mealPlanItems);
        if(d.ratings) setRatings(d.ratings);
        alert("✅ Data imported successfully!");
      } catch(e){ alert("❌ Invalid backup file."); }
    };
    rd.readAsText(f);
  };

  const navTo = (id) => { setSec(id); if(isMobile) setSidebar(false); };

  return (
    <div data-theme={darkMode?"dark":"light"} style={{display:"flex",height:"100vh",background:"var(--bg)",fontFamily:"'DM Sans',sans-serif",overflow:"hidden",color:"var(--text)"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=DM+Sans:wght@300;400;500;600;700&display=swap');
        [data-theme="dark"]{
          --bg:#1a1d2a;--bg-card:#1e2133;--bg-sidebar:#161924;--nm-input-bg:#141722;
          --shadow-dark:#0d1020;--shadow-light:#27304a;
          --text:#dce4f8;--text-sub:#7a88a8;--text-muted:#4a5a70;
          --accent:#5aad8e;--accent2:#3a7d5e;
          --nm-raised:8px 8px 16px var(--shadow-dark),-8px -8px 16px var(--shadow-light);
          --nm-raised-sm:4px 4px 8px var(--shadow-dark),-4px -4px 8px var(--shadow-light);
          --nm-inset:inset 4px 4px 8px var(--shadow-dark),inset -4px -4px 8px var(--shadow-light);
          --border:rgba(255,255,255,0.06);--card-hover:rgba(255,255,255,0.03);
        }
        [data-theme="light"]{
          --bg:#e4e8f2;--bg-card:#edf0f8;--bg-sidebar:#dde1ed;--nm-input-bg:#d8dce8;
          --shadow-dark:#b8bcca;--shadow-light:#ffffff;
          --text:#1a1e30;--text-sub:#4a5270;--text-muted:#8a90a8;
          --accent:#3a7d5e;--accent2:#5aad8e;
          --nm-raised:8px 8px 16px var(--shadow-dark),-8px -8px 16px var(--shadow-light);
          --nm-raised-sm:4px 4px 8px var(--shadow-dark),-4px -4px 8px var(--shadow-light);
          --nm-inset:inset 4px 4px 8px var(--shadow-dark),inset -4px -4px 8px var(--shadow-light);
          --border:rgba(0,0,0,0.06);--card-hover:rgba(0,0,0,0.02);
        }
        *{transition:background-color .25s,color .25s,box-shadow .25s}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:var(--text-muted);border-radius:4px}
        button:focus,input:focus,select:focus,textarea:focus{outline:none}
        select option{background:var(--bg-card);color:var(--text)}
        input::placeholder,textarea::placeholder{color:var(--text-muted)}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
        .nm-card{background:var(--bg-card);box-shadow:var(--nm-raised);border-radius:18px;overflow:hidden;transition:box-shadow .2s,transform .2s}
        .nm-card:hover{box-shadow:var(--nm-raised),0 0 0 1px var(--accent)22;transform:translateY(-3px)}
        .nm-btn:hover{box-shadow:var(--nm-inset)!important}
        .r-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:18px}
        .r-grid-sm{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px}
        @media(max-width:767px){
          .r-grid{grid-template-columns:repeat(2,1fr);gap:12px}
          .r-grid-sm{grid-template-columns:repeat(2,1fr);gap:10px}
          .hide-mobile{display:none!important}
          .modal-wrap{padding:0!important}
          .modal-inner{border-radius:0!important;max-height:100vh!important;height:100vh;border:none!important}
        }
        @media(max-width:400px){
          .r-grid{grid-template-columns:1fr;gap:10px}
          .r-grid-sm{grid-template-columns:repeat(2,1fr);gap:8px}
        }
      `}</style>

      {/* Mobile backdrop */}
      {isMobile && sidebar && <div onClick={()=>setSidebar(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:499,backdropFilter:"blur(2px)"}}/>}

      {/* Sidebar */}
      <div style={isMobile
        ? {position:"fixed",top:0,left:sidebar?0:-240,height:"100vh",width:230,zIndex:500,background:"var(--bg-sidebar)",borderRight:"1px solid var(--border)",boxShadow:"6px 0 24px rgba(0,0,0,0.4)",transition:"left .28s cubic-bezier(.4,0,.2,1)",display:"flex",flexDirection:"column"}
        : {width:sidebar?230:0,minWidth:sidebar?230:0,background:"var(--bg-sidebar)",borderRight:"1px solid var(--border)",boxShadow:"4px 0 12px var(--shadow-dark)",transition:"width .25s,min-width .25s",overflow:"hidden",flexShrink:0,display:"flex",flexDirection:"column"}}>
        <div style={{padding:"16px 16px 12px",display:"flex",alignItems:"center",gap:10}}>
          <img src="/logo.svg" alt="MealPrepMaster" style={{width:38,height:38,flexShrink:0}}/>
          <div>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:15,fontWeight:700,color:"var(--accent)",whiteSpace:"nowrap",lineHeight:1.2}}>MealPrepMaster</div>
            <div style={{color:"var(--text-muted)",fontSize:11,whiteSpace:"nowrap"}}>{recipes.length} recipes saved</div>
          </div>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"0 8px"}}>
          {navItems.map(item=>(
            <button key={item.id} onClick={()=>navTo(item.id)}
              style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,border:"none",cursor:"pointer",marginBottom:4,background:sec===item.id?"var(--bg-card)":"transparent",boxShadow:sec===item.id?"var(--nm-raised-sm)":"none",color:sec===item.id?"var(--accent)":"var(--text-sub)",fontFamily:"inherit",fontSize:13,fontWeight:sec===item.id?600:400,textAlign:"left",whiteSpace:"nowrap",transition:"all .15s"}}>
              <span style={{fontSize:16}}>{item.icon}</span>{item.label}
              {item.id==="favorites"&&favorites.length>0&&<span style={{marginLeft:"auto",background:"var(--accent)",color:"var(--bg)",borderRadius:10,padding:"0 6px",fontSize:10,fontWeight:700}}>{favorites.length}</span>}
            </button>
          ))}

          <div style={{padding:"12px 12px 4px",color:"var(--text-muted)",fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginTop:8}}>Filter by Goal</div>
          {[null,...GOALS].map(g=>(
            <button key={g||"all"} onClick={()=>setGoalF(g)}
              style={{width:"100%",display:"flex",alignItems:"center",padding:"7px 12px",borderRadius:10,border:"none",cursor:"pointer",background:goalF===g&&g?"var(--bg-card)":"transparent",boxShadow:goalF===g&&g?"var(--nm-raised-sm)":"none",color:goalF===g&&g?"var(--accent)":"var(--text-sub)",fontFamily:"inherit",fontSize:12,textAlign:"left",whiteSpace:"nowrap",transition:"all .15s"}}>
              {g||"All goals"}
            </button>
          ))}
        </div>
        <div style={{padding:"10px 16px",borderTop:"1px solid var(--border)",flexShrink:0}}>
          <div style={{color:"var(--text-muted)",fontSize:10,textAlign:"center"}}>
            {anthropicKey ? <span style={{color:"var(--accent)"}}>✓ AI enabled</span> : <span style={{color:"#f08080"}}>⚠ Click ⚙️ to add API key</span>}
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {/* Topbar */}
        <div style={{height:isMobile?52:56,background:"var(--bg-sidebar)",borderBottom:"1px solid var(--border)",boxShadow:"0 4px 12px var(--shadow-dark)",display:"flex",alignItems:"center",padding:isMobile?"0 10px":"0 16px",gap:isMobile?8:12,flexShrink:0,position:"relative",zIndex:100}}>
          <button onClick={()=>setSidebar(s=>!s)} style={{...GB,padding:"6px 10px",fontSize:16,lineHeight:1,flexShrink:0}}>☰</button>
          {!isMobile && <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search recipes or ingredients..."
            style={{...IS,flex:1,maxWidth:380,height:36,padding:"0 12px",fontSize:13}}/>}
          <div style={{flex:1}}/>
          {isMobile && <button onClick={()=>setSearchOpen(s=>!s)} style={{...GB,padding:"6px 10px",fontSize:16,lineHeight:1,background:searchOpen?"var(--nm-input-bg)":"var(--bg-card)"}} title="Search">🔍</button>}
          <button onClick={toggleDark} title={darkMode?"Light mode":"Dark mode"}
            style={{...GB,padding:"6px 10px",fontSize:16,lineHeight:1,flexShrink:0}}>
            {darkMode?"☀️":"🌙"}
          </button>
          <button onClick={()=>setSettingsOpen(s=>!s)} title="API Keys"
            style={{...GB,background:anthropicKey?"rgba(58,125,94,0.25)":"rgba(192,80,80,0.18)",color:anthropicKey?"var(--accent)":"#f08080",padding:"7px 10px",fontSize:isMobile?13:13,flexShrink:0}}>
            {isMobile?(anthropicKey?"⚙️✓":"⚙️!"):(anthropicKey?"⚙️ Keys ✓":"⚙️ Add API Key")}
          </button>
          <button onClick={()=>setAddOpen(true)} style={{background:"linear-gradient(135deg,var(--accent2),var(--accent))",boxShadow:"var(--nm-raised-sm)",border:"none",borderRadius:10,color:"#fff",padding:isMobile?"8px 12px":"8px 16px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",flexShrink:0}}>
            {isMobile?"＋":"+ Add Recipe"}
          </button>
        </div>
        {/* Mobile search bar (expandable) */}
        {isMobile && searchOpen && (
          <div style={{background:"var(--bg-sidebar)",padding:"8px 10px",borderBottom:"1px solid var(--border)"}}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search recipes or ingredients..." autoFocus
              style={{...IS,height:36,padding:"0 12px",fontSize:14}}/>
          </div>
        )}

        {/* Settings dropdown */}
        {settingsOpen && (
          <div style={{position:"absolute",top:64,right:16,zIndex:200,background:"var(--bg-card)",boxShadow:"var(--nm-raised),0 16px 48px var(--shadow-dark)",borderRadius:18,padding:22,width:310}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <span style={{color:"var(--text)",fontWeight:700,fontSize:14}}>⚙️ API Keys</span>
              <button onClick={()=>setSettingsOpen(false)} style={{...GB,padding:"3px 9px",fontSize:18,lineHeight:1}}>×</button>
            </div>
            <div style={{marginBottom:16}}>
              <div style={{color:"var(--text-sub)",fontSize:11,fontWeight:700,marginBottom:8,textTransform:"uppercase",letterSpacing:.8}}>🤖 Anthropic Key <span style={{color:"#f08080"}}>(required for AI)</span></div>
              <input type="password" placeholder="sk-ant-api03-…" value={anthropicKey}
                onChange={e=>{setAnthropicKey(e.target.value);pwaSet('anthropic_key',e.target.value);}}
                onKeyDown={e=>{if(e.key==='Enter') setSettingsOpen(false);}}
                style={{...IS,fontSize:13,marginBottom:8}}/>
              {anthropicKey
                ? <div style={{color:"var(--accent)",fontSize:11}}>✓ AI extraction &amp; image generation enabled</div>
                : <div style={{color:"var(--text-sub)",fontSize:11}}>Get a free key at <span style={{color:"#5a8fd4"}}>console.anthropic.com</span> → API Keys</div>}
            </div>
            <div>
              <div style={{color:"var(--text-sub)",fontSize:11,fontWeight:700,marginBottom:8,textTransform:"uppercase",letterSpacing:.8}}>📷 Pexels Key <span style={{color:"var(--text-muted)"}}>(optional, for real photos)</span></div>
              <input type="password" placeholder="Pexels API key…" value={pexelsKey}
                onChange={e=>{setPexelsKey(e.target.value);pwaSet('pexels_key',e.target.value);}}
                onKeyDown={e=>{if(e.key==='Enter') setSettingsOpen(false);}}
                style={{...IS,fontSize:13,marginBottom:8}}/>
              {pexelsKey
                ? <div style={{color:"var(--accent)",fontSize:11}}>✓ Real food photos enabled</div>
                : <div style={{color:"var(--text-sub)",fontSize:11}}>Free at <span style={{color:"#5a8fd4"}}>pexels.com/api</span></div>}
            </div>
            <div style={{borderTop:"1px solid var(--border)",marginTop:14,paddingTop:14}}>
              <div style={{color:"var(--text-sub)",fontSize:11,fontWeight:700,marginBottom:6,textTransform:"uppercase",letterSpacing:.8}}>☁️ Cloud Sync {syncing && <span style={{color:"var(--accent)",fontWeight:400}}>· saving…</span>}</div>
              {syncError && <div style={{background:"rgba(240,128,128,0.12)",border:"1px solid rgba(240,128,128,0.3)",borderRadius:8,padding:"7px 10px",color:"#f08080",fontSize:11,marginBottom:8}}>⚠ Sync error: {syncError}</div>}
              {authStep==='done' && supaUser ? (
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:8,background:"rgba(90,173,142,0.12)",border:"1px solid rgba(90,173,142,0.25)",borderRadius:10,padding:"8px 12px",marginBottom:10}}>
                    <span style={{fontSize:18}}>✅</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{color:"var(--accent)",fontSize:12,fontWeight:700}}>Synced</div>
                      <div style={{color:"var(--text-muted)",fontSize:10,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{supaUser.email}</div>
                    </div>
                    <button onClick={supaSignOut} style={{...GB,fontSize:11,padding:"4px 8px",color:"#f08080"}}>Sign out</button>
                  </div>
                  <div style={{color:"var(--text-muted)",fontSize:10,marginBottom:8}}>All changes save automatically across all your devices.</div>
                  <button onClick={async()=>{
                    setSyncing(true);
                    try {
                      const syncedRecipes = await prepareRecipesForSync(recipes);
                      const withImgs = syncedRecipes.filter(r=>r.image).length;
                      await getSupabase()?.from('user_data').upsert({user_id:supaUser.id,data:JSON.stringify({recipes:syncedRecipes,favorites,mealPlanItems,ratings,anthropicKey,pexelsKey,shoppingSpends,profiles}),updated_at:new Date().toISOString()});
                      alert(`✅ Synced! ${withImgs}/${syncedRecipes.length} recipes have images.`);
                    } catch(e){ alert('❌ Sync failed: '+e.message); }
                    setSyncing(false);
                  }} style={{...GB,width:"100%",fontSize:12,marginBottom:4,background:"var(--accent)",color:"#fff",fontWeight:700}}>
                    ☁️ Sync Now ({recipes.length} recipes)
                  </button>
                  <button onClick={async()=>{
                    setSyncing(true);
                    try {
                      const d = await loadFromSupabase(supaUser, true);
                      const total = d?.recipes?.length || 0;
                      const withImg = (d?.recipes||[]).filter(r=>r.image).length;
                      alert(`✅ Loaded ${total} recipes from cloud.\n${withImg} have images.\nFirst image: ${(d?.recipes||[]).find(r=>r.image)?.image?.slice(0,60) || 'none'}`);
                    } catch(e){ alert('❌ Failed: '+e.message); }
                    setSyncing(false);
                  }} style={{...GB,width:"100%",fontSize:12,marginBottom:8}}>
                    🔄 Get Latest from Cloud
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{color:"var(--text-muted)",fontSize:11,marginBottom:10}}>Sign in to sync across devices. We'll email you a 6-digit code — no password needed.</div>
                  {authStep==='idle' || authStep==='sending' ? (
                    <div style={{display:"flex",gap:8}}>
                      <input value={authEmail} onChange={e=>setAuthEmail(e.target.value)}
                        onKeyDown={e=>e.key==='Enter'&&sendOTP()}
                        placeholder="your@email.com" type="email"
                        style={{...IS,flex:1,fontSize:12,height:34,padding:"0 10px"}}/>
                      <button onClick={sendOTP} disabled={authStep==='sending'||!authEmail.trim()}
                        style={{...GB,fontSize:12,padding:"6px 12px",background:"var(--accent)",color:"#fff",fontWeight:700,opacity:authStep==='sending'?0.6:1}}>
                        {authStep==='sending'?'…':'Send'}
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div style={{color:"var(--text-sub)",fontSize:11,marginBottom:6}}>Enter the 6-digit code sent to <strong>{authEmail}</strong>:</div>
                      <div style={{display:"flex",gap:8,marginBottom:8}}>
                        <input value={authOTP} onChange={e=>setAuthOTP(e.target.value)}
                          onKeyDown={e=>e.key==='Enter'&&verifyOTP()}
                          placeholder="123456" maxLength={6}
                          style={{...IS,flex:1,fontSize:18,height:38,padding:"0 10px",letterSpacing:6,textAlign:"center"}}/>
                        <button onClick={verifyOTP} disabled={authStep==='verifying'||!authOTP.trim()}
                          style={{...GB,fontSize:12,padding:"6px 12px",background:"var(--accent)",color:"#fff",fontWeight:700,opacity:authStep==='verifying'?0.6:1}}>
                          {authStep==='verifying'?'…':'Verify'}
                        </button>
                      </div>
                      <button onClick={()=>{setAuthStep('idle');setAuthOTP('');setAuthError('');}} style={{color:"var(--text-muted)",background:"none",border:"none",fontSize:11,cursor:"pointer",padding:0}}>← Use different email</button>
                    </div>
                  )}
                  {authError && <div style={{color:"#f08080",fontSize:11,marginTop:6}}>{authError}</div>}
                </div>
              )}
              <div style={{borderTop:"1px solid var(--border)",marginTop:10,paddingTop:10}}>
                <div style={{color:"var(--text-muted)",fontSize:10,marginBottom:8}}>Manual backup:</div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={exportData} style={{...GB,flex:1,fontSize:11}}>📤 Export</button>
                  <label style={{...GB,flex:1,fontSize:11,textAlign:"center",cursor:"pointer"}}>
                    📥 Import
                    <input type="file" accept=".json" style={{display:"none"}} onChange={importData}/>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div style={{flex:1,overflowY:"auto",padding:isMobile?12:24,paddingBottom:isMobile?76:24,background:"var(--bg)"}}>

          {/* Dashboard */}
          {sec==="dashboard" && (
            <div>
              <h2 style={{color:"var(--text)",fontFamily:"'Playfair Display',serif",marginBottom:6}}>Dashboard</h2>
              <p style={{color:"var(--text-sub)",fontSize:14,marginBottom:22}}>Your meal prep overview</p>
              <div className="r-grid-sm" style={{marginBottom:28}}>
                {[[recipes.length,"Recipes","📖","#5a8fd4"],[favorites.length,"Favorites","♥","#c06090"],[mealPlanItems.length,"Planned","📅","#5aad8e"],[recipes.filter(r=>(r.tags||[]).some(t=>HEALTH_TAGS.includes(t))).length,"Health","💚","#d4875a"]].map(([v,l,ico,col])=>(
                  <div key={l} style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised)",borderRadius:16,padding:"18px 16px",cursor:"pointer",transition:"all .2s"}}
                    onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="var(--nm-inset)";}} onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="var(--nm-raised)";}}>
                    <div style={{fontSize:24,marginBottom:8}}>{ico}</div>
                    <div style={{color:col,fontWeight:800,fontSize:28,lineHeight:1}}>{v}</div>
                    <div style={{color:"var(--text-muted)",fontSize:11,marginTop:4,textTransform:"uppercase",letterSpacing:.5}}>{l}</div>
                  </div>
                ))}
              </div>
              {/* Tips Carousel */}
              {(() => {
                const TIPS = ["Start your rice cooker first — it frees up stove space","Chop all vegetables before turning on any heat","Use oven & stovetop simultaneously to halve your prep time","Batch cook proteins on Sundays for the whole week"];
                return (
                  <div style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised)",borderRadius:14,padding:"16px 18px",marginBottom:24,display:"flex",alignItems:"center",gap:12,borderLeft:"3px solid var(--accent)"}}>
                    <span style={{fontSize:22,flexShrink:0}}>💡</span>
                    <div style={{flex:1,color:"var(--text)",fontSize:14,lineHeight:1.5}}>{TIPS[tipIdx]}</div>
                    <div style={{display:"flex",gap:6,flexShrink:0}}>
                      <button onClick={()=>setTipIdx(i=>(i-1+TIPS.length)%TIPS.length)} style={{...GB,padding:"4px 10px",fontSize:14}}>‹</button>
                      <span style={{color:"#6a7a90",fontSize:11,alignSelf:"center"}}>{tipIdx+1}/{TIPS.length}</span>
                      <button onClick={()=>setTipIdx(i=>(i+1)%TIPS.length)} style={{...GB,padding:"4px 10px",fontSize:14}}>›</button>
                    </div>
                  </div>
                );
              })()}
              {/* Macro Goal Tracker */}
              {mealPlanItems.length>0 && (()=>{
                const planned = {calories:mealPlanItems.reduce((s,i)=>s+(i.nutrition?.calories||0),0),protein:mealPlanItems.reduce((s,i)=>s+(i.nutrition?.protein||0),0),carbs:mealPlanItems.reduce((s,i)=>s+(i.nutrition?.carbs||0),0),fat:mealPlanItems.reduce((s,i)=>s+(i.nutrition?.fat||0),0)};
                return (
                  <div style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised)",borderRadius:14,padding:"16px 18px",marginBottom:24}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                      <h3 style={{color:"var(--text)",fontSize:14,fontWeight:700,margin:0}}>🎯 Daily Macro Goals vs Plan</h3>
                      <button onClick={()=>setSec("statistics")} style={{...GB,fontSize:11,padding:"3px 8px",color:"var(--accent)"}}>Edit Goals</button>
                    </div>
                    {[["🔥 Calories",planned.calories,macroGoals.calories,"#e05a6a"],["💪 Protein",planned.protein,macroGoals.protein,"#5aad8e"],["🌾 Carbs",planned.carbs,macroGoals.carbs,"#5a8fd4"],["🥑 Fat",planned.fat,macroGoals.fat,"#d4875a"]].map(([l,v,g,col])=>{
                      const pct=Math.min(v/Math.max(g,1)*100,120);const over=pct>100;
                      return (
                        <div key={l} style={{marginBottom:10}}>
                          <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}>
                            <span style={{color:"var(--text-sub)"}}>{l}</span>
                            <span style={{color:over?"#e07a40":col,fontWeight:700}}>{Math.round(v)} / {g}{l.includes("Cal")?"kcal":"g"} {over?"⚠ over":""}</span>
                          </div>
                          <div style={{height:7,background:"var(--nm-input-bg)",borderRadius:4,overflow:"hidden",boxShadow:"var(--nm-inset)"}}>
                            <div style={{height:"100%",width:Math.min(pct,100)+"%",background:over?"#e07a40":col,borderRadius:4,transition:"width .5s"}}/>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Cooking Streak */}
              {(()=>{
                const today = new Date().toDateString();
                const todayCooked = cookLog.some(l=>new Date(l.date).toDateString()===today);
                let streak=0;
                const d=new Date();
                while(true){const ds=d.toDateString();if(!cookLog.some(l=>new Date(l.date).toDateString()===ds))break;streak++;d.setDate(d.getDate()-1);}
                if(streak===0&&!todayCooked) return null;
                return (
                  <div style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised)",borderRadius:14,padding:"14px 18px",marginBottom:24,display:"flex",alignItems:"center",gap:14,borderLeft:"3px solid #ffd580"}}>
                    <span style={{fontSize:28}}>🔥</span>
                    <div>
                      <div style={{color:"#ffd580",fontWeight:800,fontSize:20}}>{streak} day{streak!==1?"s":""} streak!</div>
                      <div style={{color:"var(--text-sub)",fontSize:12}}>{todayCooked?"You cooked today":"Cook something today to keep the streak!"}</div>
                    </div>
                    <div style={{marginLeft:"auto",color:"var(--text-muted)",fontSize:12}}>{cookLog.length} total sessions</div>
                  </div>
                );
              })()}

              <h3 style={{color:"var(--text)",fontSize:14,fontWeight:700,marginBottom:14}}>Recent Recipes</h3>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:18,marginBottom:28}}>
                {recipes.slice(-4).reverse().map(r=>(
                  <RecipeCard key={r.id} recipe={r} onClick={setViewing} onFavorite={toggleFav} isFavorite={isFav(r)}/>
                ))}
              </div>
              {(() => {
                const suggested = recipes.filter(r=>(r.tags||[]).some(t=>["Anti-Inflammatory","Blood Sugar Stable"].includes(t)));
                if (!suggested.length) return null;
                return (
                  <div style={{marginBottom:28}}>
                    <h3 style={{color:"var(--accent)",fontSize:14,fontWeight:700,marginBottom:4}}>💚 Suggested for You</h3>
                    <p style={{color:"var(--text-sub)",fontSize:12,marginBottom:14}}>Anti-inflammatory &amp; blood sugar-stabilizing meals</p>
                    <div className="r-grid">
                      {suggested.slice(0,4).map(r=>(
                        <RecipeCard key={r.id} recipe={r} onClick={setViewing} onFavorite={toggleFav} isFavorite={isFav(r)}/>
                      ))}
                    </div>
                  </div>
                );
              })()}
              {recipes.length===0 && (
                <div style={{textAlign:"center",padding:"48px 0",color:"#5a6a7a"}}>
                  <div style={{fontSize:40,marginBottom:12}}>🥗</div>
                  <div style={{fontSize:15,color:"#8a9bb0",marginBottom:8}}>No recipes yet</div>
                  <button onClick={()=>setAddOpen(true)} style={{background:"linear-gradient(135deg,#3a7d5e,#5aad8e)",border:"none",borderRadius:10,color:"#fff",padding:"10px 20px",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Add your first recipe</button>
                </div>
              )}
            </div>
          )}

          {/* Recipes */}
          {sec==="recipes" && (
            <div>
              {/* Header row */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
                <div style={{display:"flex",alignItems:"baseline",gap:10}}>
                  <h2 style={{color:"var(--text)",fontFamily:"'Playfair Display',serif",margin:0}}>All Recipes</h2>
                  <span style={{color:"var(--text-muted)",fontSize:12}}>{filtered.length} of {recipes.length}</span>
                </div>
                <div style={{display:"flex",gap:7,flexWrap:"wrap",alignItems:"center"}}>
                  {anyFilterActive && (
                    <button onClick={clearAllFilters} style={{...CB,fontSize:11,color:"#f08080",border:"1px solid rgba(240,128,128,0.3)"}}>✕ Clear filters</button>
                  )}
                  <button onClick={()=>setBudgetMode(b=>!b)}
                    style={{...CB,fontSize:12,padding:"5px 12px",background:budgetMode?"rgba(90,173,142,0.18)":"var(--bg-card)",color:budgetMode?"#5aad8e":"var(--text-sub)",boxShadow:budgetMode?"var(--nm-inset)":"var(--nm-raised-sm)",border:budgetMode?"1px solid rgba(90,173,142,0.3)":"none"}}>
                    💰 Budget Mode {budgetMode?"ON":"OFF"}
                  </button>
                  <button onClick={()=>setAddOpen(true)} style={{background:"linear-gradient(135deg,#3a7d5e,#5aad8e)",border:"none",borderRadius:9,color:"#fff",padding:"8px 16px",fontWeight:700,cursor:"pointer",fontFamily:"inherit",fontSize:13}}>+ Add Recipe</button>
                </div>
              </div>

              {/* Budget mode panel */}
              {budgetMode && (
                <div style={{background:"rgba(90,173,142,0.07)",border:"1px solid rgba(90,173,142,0.25)",borderRadius:14,padding:"12px 16px",marginBottom:14,display:"flex",gap:16,flexWrap:"wrap",alignItems:"center"}}>
                  <span style={{fontSize:20}}>💰</span>
                  <div>
                    <div style={{color:"#5aad8e",fontWeight:700,fontSize:13}}>Budget Mode</div>
                    <div style={{color:"var(--text-muted)",fontSize:11}}>Showing estimated cost per serving on each recipe card</div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginLeft:"auto"}}>
                    <span style={{color:"var(--text-sub)",fontSize:12}}>Weekly budget $</span>
                    <input type="number" value={weeklyBudget} onChange={e=>setWeeklyBudget(Math.max(1,+e.target.value))}
                      style={{...IS,width:70,height:32,padding:"0 8px",fontSize:13}}/>
                    <span style={{color:"var(--text-muted)",fontSize:11}}>/week</span>
                  </div>
                  <div style={{color:"var(--text-muted)",fontSize:11}}>~${(weeklyBudget/21).toFixed(2)}/meal max</div>
                </div>
              )}

              {/* Category filter */}
              <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
                {CATEGORIES.map(c=>(
                  <button key={c.id} onClick={()=>setCatF(c.id)}
                    style={{...CB,boxShadow:catF===c.id?"var(--nm-inset)":"var(--nm-raised-sm)",color:catF===c.id?"var(--accent)":"var(--text-sub)",padding:"6px 14px"}}>
                    {c.icon} {c.label}
                  </button>
                ))}
              </div>

              {/* Diet tag filter */}
              <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:6}}>
                {DIET_TAGS.map(t=>(
                  <button key={t} onClick={()=>setTagF(tagF===t?null:t)}
                    style={{...CB,boxShadow:tagF===t?"var(--nm-inset)":"var(--nm-raised-sm)",color:tagF===t?(TAG_COLORS[t]||"var(--accent)"):"var(--text-sub)"}}>
                    {t}
                  </button>
                ))}
              </div>

              {/* Health tag filter */}
              <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:6}}>
                {HEALTH_TAGS.map(t=>(
                  <button key={t} onClick={()=>setHealthF(healthF===t?null:t)}
                    style={{...CB,boxShadow:healthF===t?"var(--nm-inset)":"var(--nm-raised-sm)",color:healthF===t?(HEALTH_COLORS[t]||"var(--accent)"):"var(--text-sub)"}}>
                    {t}
                  </button>
                ))}
              </div>

              {/* Difficulty + Time filters */}
              <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:6,alignItems:"center"}}>
                <span style={{color:"var(--text-muted)",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:.8,marginRight:2}}>Difficulty</span>
                {[null,"beginner","intermediate","advanced"].map(d=>(
                  <button key={d||"all"} onClick={()=>setDiffF(diffF===d?null:d)}
                    style={{...CB,boxShadow:diffF===d&&d?"var(--nm-inset)":"var(--nm-raised-sm)",color:diffF===d&&d?(DIFFICULTIES[d]?.color||"var(--accent)"):"var(--text-sub)",fontSize:11}}>
                    {d?DIFFICULTIES[d].icon+" "+DIFFICULTIES[d].label:"All"}
                  </button>
                ))}
                <span style={{color:"var(--text-muted)",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:.8,margin:"0 2px 0 10px"}}>Time</span>
                {[[null,"Any"],[15,"≤15m"],[30,"≤30m"],[60,"≤1hr"]].map(([val,label])=>(
                  <button key={label} onClick={()=>setMaxTimeF(maxTimeF===val?null:val)}
                    style={{...CB,boxShadow:maxTimeF===val&&val!==null?"var(--nm-inset)":"var(--nm-raised-sm)",color:maxTimeF===val&&val!==null?"var(--accent)":"var(--text-sub)",fontSize:11}}>
                    {label}
                  </button>
                ))}
                <span style={{color:"var(--text-muted)",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:.8,margin:"0 2px 0 10px"}}>Budget</span>
                {[[null,"Any"],[2,"≤$2"],[4,"≤$4"],[6,"≤$6"]].map(([val,label])=>(
                  <button key={label} onClick={()=>setMaxCostF(maxCostF===val?null:val)}
                    style={{...CB,boxShadow:maxCostF===val&&val!==null?"var(--nm-inset)":"var(--nm-raised-sm)",color:maxCostF===val&&val!==null?"#5aad8e":"var(--text-sub)",fontSize:11}}>
                    {label}
                  </button>
                ))}
              </div>

              {/* Cuisine filter */}
              {recipes.some(r=>r.cuisine) && (
                <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:6}}>
                  {CUISINES.filter(c=>recipes.some(r=>r.cuisine===c)).map(c=>(
                    <button key={c} onClick={()=>setCuisineF(cuisineF===c?null:c)}
                      style={{...CB,boxShadow:cuisineF===c?"var(--nm-inset)":"var(--nm-raised-sm)",color:cuisineF===c?(CUISINE_COLORS[c]||"var(--accent)"):"var(--text-sub)",fontSize:11}}>
                      🌍 {c}
                    </button>
                  ))}
                </div>
              )}

              <div style={{height:12}}/>

              {filtered.length===0
                ? <div style={{textAlign:"center",padding:"48px 0",color:"#5a6a7a"}}>
                    <div style={{fontSize:36,marginBottom:10}}>🔍</div>
                    <div style={{marginBottom:12}}>No recipes match your filters</div>
                    {anyFilterActive && <button onClick={clearAllFilters} style={{...CB,color:"var(--accent)"}}>Clear all filters</button>}
                  </div>
                : <div className="r-grid">
                    {filtered.map(r=><RecipeCard key={r.id} recipe={r} onClick={setViewing} onFavorite={toggleFav} isFavorite={isFav(r)} costPerServing={budgetMode?recipeEstCost(r):undefined}/>)}
                  </div>
              }
            </div>
          )}

          {sec==="mix-match" && <MixMatch recipes={recipes} onAddToMealPlan={item=>setMealPlanItems(p=>[...p,item])} onSaveAsRecipe={r=>setRecipes(p=>[...p,r])}/>}

          {sec==="meal-plan" && <MealPlanManager recipes={recipes} mealPlanItems={mealPlanItems} setMealPlanItems={setMealPlanItems} onGoShopping={()=>setSec("shopping")}/>}

          {sec==="shopping" && <ShoppingList mealPlanItems={mealPlanItems} recipes={recipes} spends={shoppingSpends} onLogSpend={s=>setShoppingSpends(p=>[...p,s])} weeklyBudget={budgetMode?weeklyBudget:null}/>}

          {sec==="gallery" && <PhotoGallery recipes={recipes} onView={setViewing}/>}

          {sec==="supplements" && (
            <div>
              <ProfileSelector profiles={profiles} activeProfileId={activeProfileId} setActiveProfileId={setActiveProfileId} addProfile={addProfile} deleteProfile={deleteProfile} renameProfile={renameProfile}/>
              <SupplementTracker supplements={supplements} setSupplements={setSupplements}/>
            </div>
          )}

          {sec==="statistics" && <StatisticsPanel recipes={recipes} mealPlanItems={mealPlanItems} ratings={ratings} favorites={favorites} shoppingSpends={shoppingSpends} cookLog={cookLog} macroGoals={macroGoals} setMacroGoals={setMacroGoals} onDeleteSpend={id=>setShoppingSpends(p=>p.filter(s=>s.id!==id))} profileSelector={<ProfileSelector profiles={profiles} activeProfileId={activeProfileId} setActiveProfileId={setActiveProfileId} addProfile={addProfile} deleteProfile={deleteProfile} renameProfile={renameProfile}/>}/>}

          {sec==="optimizer" && <MealPrepOptimizer recipes={recipes} onAddToMealPlan={item=>setMealPlanItems(p=>[...p,item])}/>}

          {sec==="ingredient-search" && <IngredientSearch recipes={recipes} onView={setViewing}/>}

          {sec==="favorites" && <FavoritesView favorites={favorites} recipes={recipes} setFavorites={setFavorites} onView={setViewing}/>}
        </div>
      </div>

      {/* Mobile bottom tab bar */}
      {isMobile && (
        <div style={{position:"fixed",bottom:0,left:0,right:0,height:60,background:"var(--bg-sidebar)",borderTop:"1px solid var(--border)",display:"flex",zIndex:400,boxShadow:"0 -4px 16px var(--shadow-dark)"}}>
          {navItems.slice(0,5).map(item=>(
            <button key={item.id} onClick={()=>navTo(item.id)}
              style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,border:"none",background:"transparent",color:sec===item.id?"var(--accent)":"var(--text-muted)",cursor:"pointer",fontFamily:"inherit",padding:"4px 0",position:"relative"}}>
              <span style={{fontSize:20,lineHeight:1}}>{item.icon}</span>
              <span style={{fontSize:9,fontWeight:sec===item.id?700:400,letterSpacing:.3}}>{item.label}</span>
              {item.id==="favorites"&&favorites.length>0&&<span style={{position:"absolute",top:4,right:"calc(50% - 18px)",background:"var(--accent)",color:"var(--bg)",borderRadius:8,padding:"0 4px",fontSize:9,fontWeight:700,lineHeight:1.6}}>{favorites.length}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Modals */}
      {viewing && (
        <RecipeDetail
          recipe={viewing} onClose={()=>setViewing(null)}
          onFavorite={toggleFav} isFavorite={isFav(viewing)}
          onRate={r=>setRatingTarget(r)} ratings={ratings}
          onEdit={()=>setEditTarget(viewing)}
          onMarkCooked={r=>setCookLog(p=>[...p,{id:Date.now(),recipeId:r.id,recipeName:r.title,date:new Date().toISOString()}])}/>
      )}
      {addOpen && <SmartAddModal onClose={()=>setAddOpen(false)} onAdd={r=>setRecipes(p=>[...p,r])}/>}
      {editTarget && <EditRecipeModal recipe={editTarget} onClose={()=>setEditTarget(null)}
        onSave={updated=>{setRecipes(p=>p.map(r=>r.id===updated.id?updated:r));setViewing(updated);setEditTarget(null);}}/>}
      {ratingTarget && <RatingModal recipe={ratingTarget} existing={ratings[ratingTarget.id]} onSave={(id,r)=>setRatings(p=>({...p,[id]:r}))} onClose={()=>setRatingTarget(null)}/>}

      {/* AI Meal Coach */}
      <div style={{position:"fixed",bottom:isMobile?72:24,right:20,zIndex:300}}>
        {coachOpen && (
          <div style={{position:"absolute",bottom:56,right:0,width:320,background:"var(--bg-card)",boxShadow:"var(--nm-raised)",borderRadius:20,overflow:"hidden",border:"1px solid var(--border)"}}>
            <div style={{padding:"14px 16px",background:"var(--bg-sidebar)",borderBottom:"1px solid var(--border)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{color:"var(--text)",fontWeight:700,fontSize:14}}>🤖 Meal Coach</span>
              <button onClick={()=>setCoachOpen(false)} style={{...GB,padding:"2px 8px",fontSize:16}}>×</button>
            </div>
            <div style={{height:280,overflowY:"auto",padding:"12px 14px",display:"flex",flexDirection:"column",gap:10}}>
              {coachMsgs.map((m,i)=>(
                <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
                  <div style={{maxWidth:"85%",background:m.role==="user"?"var(--accent)":"var(--nm-input-bg)",boxShadow:"var(--nm-raised-sm)",color:m.role==="user"?"#fff":"var(--text)",borderRadius:12,padding:"8px 12px",fontSize:13,lineHeight:1.5}}>{m.content}</div>
                </div>
              ))}
              {coachLoading && <div style={{color:"var(--text-muted)",fontSize:12,textAlign:"center"}}>Thinking...</div>}
            </div>
            <div style={{padding:"10px 12px",borderTop:"1px solid var(--border)",display:"flex",gap:8}}>
              <input value={coachInput} onChange={e=>setCoachInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendCoach()} placeholder="Ask anything…" style={{...IS,flex:1,height:34,padding:"0 10px",fontSize:13}}/>
              <button onClick={sendCoach} style={{...GB,padding:"6px 12px",background:"var(--accent)",color:"#fff",fontWeight:700}}>→</button>
            </div>
          </div>
        )}
        <button onClick={()=>setCoachOpen(o=>!o)}
          style={{width:48,height:48,borderRadius:"50%",background:"linear-gradient(135deg,var(--accent2),var(--accent))",boxShadow:"var(--nm-raised)",border:"none",color:"#fff",fontSize:22,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
          {coachOpen?"×":"🤖"}
        </button>
      </div>
    </div>
  );
}

export default function WrappedApp() {
  return <ErrorBoundary><App/></ErrorBoundary>;
}
