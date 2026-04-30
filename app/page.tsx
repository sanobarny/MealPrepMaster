// @ts-nocheck
'use client'

import { useState, useEffect, useRef, useMemo, Component } from "react";
import { createClient } from '@supabase/supabase-js';
import { TRANSLATIONS, t as getTranslation, type Language } from './translations';

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

// ─── TRANSLATION HELPERS ──────────────────────────────────────────────────────
const t = (key, lang = 'en', replacements?) => getTranslation(key, lang, replacements);

const getCategoryLabel = (id, lang = 'en') => {
  const keys = {all: 'cat.all', breakfast: 'cat.breakfast', lunch: 'cat.lunch', dessert: 'cat.dessert', drink: 'cat.drink'};
  return t(keys[id], lang);
};

const getSectionLabel = (key, lang = 'en') => {
  const keys = {main: 'section.main', sauce: 'section.sauces', marinade: 'section.marinades', dressing: 'section.dressing', batter: 'section.batter', filling: 'section.filling', topping: 'section.toppings', garnish: 'section.garnish'};
  return t(keys[key], lang);
};

const getDifficultyLabel = (key, lang = 'en') => {
  const keys = {beginner: 'diff.beginner', intermediate: 'diff.intermediate', advanced: 'diff.advanced'};
  return t(keys[key], lang);
};

// Merge a slim cached translation (text-only) back into the original recipe (which has images etc.)
const mergeTranslation = (original, cached) => ({
  ...original,
  title: cached.title || original.title,
  description: cached.description || original.description,
  healthBenefits: cached.healthBenefits || original.healthBenefits,
  ingredients: (original.ingredients || []).map((ing, j) => ({
    ...ing, name: cached.ingredients?.[j]?.name || ing.name,
  })),
  steps: (original.steps || []).map((s, j) => ({
    ...s, text: cached.steps?.[j]?.text || s.text,
  })),
});

const translateRecipe = async (recipe, targetLang, anthropicKey?) => {
  if (targetLang === 'en' || !recipe) return recipe;
  const cacheKey = `mpm_recipe_translation_${recipe.id}_${targetLang}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) try { return mergeTranslation(recipe, JSON.parse(cached)); } catch(e) {}
  // pwaGet is defined later in the file but safe to call at runtime (TDZ only applies at parse time)
  const keyToUse = anthropicKey?.trim() || pwaGet('anthropic_key') || '';
  if (!keyToUse) return recipe;
  try {
    const langName = targetLang === 'es' ? 'Spanish' : 'Russian';
    const systemPrompt = `Translate the following recipe to ${langName}. Return ONLY valid JSON. Translate: title, description, healthBenefits, ingredient names, and step text. Return exactly: {title, description, healthBenefits, ingredients:[{name}], steps:[{text}]}`;
    const slim = {
      title: recipe.title || '', description: recipe.description || '',
      healthBenefits: recipe.healthBenefits || '',
      ingredients: (recipe.ingredients || []).map(i => ({name: i.name})),
      steps: (recipe.steps || []).map(s => ({text: s.text})),
    };
    const result = await anthropicCall({max_tokens: 4000, system: systemPrompt, messages: [{role: 'user', content: JSON.stringify(slim)}]});
    const m = result.match(/\{[\s\S]*\}/);
    if (m) {
      const translated = JSON.parse(m[0]);
      // Save only text fields — no images — to stay well within localStorage quota
      lsSave(cacheKey, JSON.stringify({id: recipe.id, ...translated}));
      return mergeTranslation(recipe, translated);
    }
  } catch(e) { console.warn('Recipe translation failed:', e); }
  return recipe;
};

// Batch-translate up to batchSize recipes in one API call — much faster than one call per recipe
const translateRecipesBatch = async (recipes, targetLang) => {
  if (targetLang === 'en' || !recipes.length) return [];
  const keyToUse = pwaGet('anthropic_key') || '';
  if (!keyToUse) return recipes;
  const langName = targetLang === 'es' ? 'Spanish' : 'Russian';
  // Strip to only translatable fields to keep request small
  const slim = recipes.map(r => ({
    id: r.id,
    title: r.title || '',
    description: r.description || '',
    healthBenefits: r.healthBenefits || '',
    ingredients: (r.ingredients || []).map(i => ({name: i.name, section: i.section})),
    steps: (r.steps || []).map(s => ({text: s.text})),
  }));
  try {
    const systemPrompt = `Translate the following recipes to ${langName}. Return ONLY a valid JSON array. Translate: title, description, healthBenefits, ingredient names, and step text. Keep all other fields unchanged. Return exactly the same number of objects in the same order.`;
    const result = await anthropicCall({max_tokens: 8000, system: systemPrompt, messages: [{role: 'user', content: JSON.stringify(slim)}]});
    const m = result.match(/\[[\s\S]*\]/);
    if (m) {
      const arr = JSON.parse(m[0]);
      if (Array.isArray(arr) && arr.length === recipes.length) {
        return arr.map((translated, i) => {
          const orig = recipes[i];
          // Save only text fields to localStorage — base64 images would overflow quota
          lsSave(`mpm_recipe_translation_${orig.id}_${targetLang}`, JSON.stringify({
            id: orig.id,
            title: translated.title || orig.title,
            description: translated.description || orig.description,
            healthBenefits: translated.healthBenefits || orig.healthBenefits,
            ingredients: (orig.ingredients || []).map((ing, j) => ({name: translated.ingredients?.[j]?.name || ing.name, section: ing.section})),
            steps: (orig.steps || []).map((s, j) => ({text: translated.steps?.[j]?.text || s.text})),
          }));
          // Return full merged recipe (with images) for immediate use in state
          return mergeTranslation(orig, translated);
        });
      }
    }
  } catch(e) { console.warn('Batch translation failed:', e); }
  return recipes;
};

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const SAMPLE_RECIPES = [
  {
    id: 1001,
    title: "Greek Chicken Meal Prep Bowl",
    description: "Juicy lemon-herb chicken thighs over fluffy quinoa with crisp cucumber, cherry tomatoes, and creamy tzatziki. A protein-packed Mediterranean bowl that keeps well for 4 days.",
    category: "lunch",
    image: null,
    cuisine: "Mediterranean",
    difficulty: "beginner",
    prepTime: 15,
    cookTime: 25,
    totalTime: 40,
    servings: 4,
    spiceLevel: 0,
    nutrition: { calories: 485, protein: 42, carbs: 38, fat: 16 },
    tags: ["High Protein", "Gluten-Free", "Blood Sugar Stable"],
    goals: ["gain muscle", "maintenance"],
    equipment: ["oven", "stove"],
    allergens: ["dairy"],
    healthBenefits: "High in lean protein for muscle repair. Quinoa provides all 9 essential amino acids. Olive oil and lemon deliver anti-inflammatory benefits.",
    ingredients: [
      { name: "chicken thighs", amount: 4, unit: "pieces", section: "main" },
      { name: "quinoa", amount: 1, unit: "cup", section: "main" },
      { name: "cucumber", amount: 1, unit: "large", section: "main" },
      { name: "cherry tomatoes", amount: 1, unit: "cup", section: "main" },
      { name: "red onion", amount: 0.5, unit: "medium", section: "main" },
      { name: "kalamata olives", amount: 0.25, unit: "cup", section: "main" },
      { name: "feta cheese", amount: 0.5, unit: "cup", section: "topping" },
      { name: "lemon juice", amount: 3, unit: "tbsp", section: "marinade" },
      { name: "olive oil", amount: 3, unit: "tbsp", section: "marinade" },
      { name: "garlic", amount: 3, unit: "cloves", section: "marinade" },
      { name: "dried oregano", amount: 1, unit: "tsp", section: "marinade" },
      { name: "tzatziki", amount: 0.5, unit: "cup", section: "sauce" },
    ],
    steps: [
      { text: "Preheat oven to 425°F (220°C). Mix lemon juice, olive oil, minced garlic, and oregano. Toss chicken thighs in the marinade and let sit 10 minutes.", timeMin: 10 },
      { text: "Rinse quinoa, then cook in 2 cups water: bring to boil, reduce heat, simmer covered 15 minutes until water is absorbed. Fluff with a fork.", timeMin: 15 },
      { text: "Place marinated chicken on a baking sheet. Roast at 425°F for 22–25 minutes until golden and internal temperature reaches 165°F.", timeMin: 25 },
      { text: "While chicken roasts, dice cucumber, halve tomatoes, and thinly slice red onion.", timeMin: 5 },
      { text: "Divide quinoa among 4 meal prep containers. Slice chicken and layer over quinoa with vegetables, olives, and feta. Add tzatziki on the side.", timeMin: 5 },
    ],
    sourceUrl: "",
    sourceType: "",
  },
  {
    id: 1002,
    title: "Overnight Oats with Berries & Chia",
    description: "No-cook, 5-minute prep breakfast that's ready when you wake up. Creamy oats loaded with antioxidant-rich berries, omega-3 chia seeds, and a drizzle of honey.",
    category: "breakfast",
    image: null,
    cuisine: "American",
    difficulty: "beginner",
    prepTime: 5,
    cookTime: 0,
    totalTime: 5,
    servings: 2,
    spiceLevel: 0,
    nutrition: { calories: 320, protein: 12, carbs: 52, fat: 8 },
    tags: ["High Fiber", "Vegan", "Antioxidant", "Gut Health", "Low Calorie"],
    goals: ["lose weight", "maintenance"],
    equipment: ["none"],
    allergens: [],
    healthBenefits: "Oats are rich in beta-glucan fiber which supports gut health and lowers cholesterol. Chia seeds provide omega-3s, calcium, and slow-digesting fiber for sustained energy.",
    ingredients: [
      { name: "rolled oats", amount: 1, unit: "cup", section: "main" },
      { name: "almond milk", amount: 1, unit: "cup", section: "main" },
      { name: "chia seeds", amount: 2, unit: "tbsp", section: "main" },
      { name: "maple syrup", amount: 1, unit: "tbsp", section: "main" },
      { name: "vanilla extract", amount: 0.5, unit: "tsp", section: "main" },
      { name: "mixed berries", amount: 1, unit: "cup", section: "topping" },
      { name: "banana", amount: 0.5, unit: "medium", section: "topping" },
      { name: "almond butter", amount: 1, unit: "tbsp", section: "topping" },
    ],
    steps: [
      { text: "Combine oats, almond milk, chia seeds, maple syrup, and vanilla in a jar or container. Stir well so chia seeds are evenly distributed.", timeMin: 3 },
      { text: "Cover and refrigerate overnight (or at least 4 hours). The oats will absorb the liquid and thicken to a creamy texture.", timeMin: 0 },
      { text: "In the morning, stir the oats and add a splash more milk if too thick. Top with mixed berries, sliced banana, and a drizzle of almond butter.", timeMin: 2 },
    ],
    sourceUrl: "",
    sourceType: "",
  },
  {
    id: 1003,
    title: "Teriyaki Salmon & Rice Meal Prep",
    description: "Flaky oven-baked salmon glazed with a sweet-savory homemade teriyaki sauce, served with jasmine rice and steamed broccoli. Perfect batch cook for the whole week.",
    category: "lunch",
    image: null,
    cuisine: "Japanese",
    difficulty: "beginner",
    prepTime: 10,
    cookTime: 20,
    totalTime: 30,
    servings: 4,
    spiceLevel: 0,
    nutrition: { calories: 520, protein: 38, carbs: 55, fat: 14 },
    tags: ["High Protein", "Omega-3 Rich", "Heart Healthy", "Dairy-Free"],
    goals: ["gain muscle", "maintenance", "lose weight"],
    equipment: ["oven", "stove", "rice cooker"],
    allergens: ["soy"],
    healthBenefits: "Salmon is one of the best sources of omega-3 fatty acids (EPA & DHA), which reduce inflammation and support brain health. Broccoli adds sulforaphane, a potent cancer-fighting compound.",
    ingredients: [
      { name: "salmon fillets", amount: 4, unit: "pieces", section: "main" },
      { name: "jasmine rice", amount: 2, unit: "cups", section: "main" },
      { name: "broccoli florets", amount: 3, unit: "cups", section: "main" },
      { name: "sesame seeds", amount: 1, unit: "tbsp", section: "topping" },
      { name: "green onions", amount: 3, unit: "stalks", section: "topping" },
      { name: "soy sauce", amount: 4, unit: "tbsp", section: "sauce" },
      { name: "honey", amount: 2, unit: "tbsp", section: "sauce" },
      { name: "rice vinegar", amount: 1, unit: "tbsp", section: "sauce" },
      { name: "garlic", amount: 2, unit: "cloves", section: "sauce" },
      { name: "fresh ginger", amount: 1, unit: "tsp", section: "sauce" },
      { name: "cornstarch", amount: 1, unit: "tsp", section: "sauce" },
    ],
    steps: [
      { text: "Cook jasmine rice in rice cooker or stovetop with 4 cups water. While rice cooks, preheat oven to 400°F (200°C) and line a baking sheet with foil.", timeMin: 5 },
      { text: "Make teriyaki sauce: whisk soy sauce, honey, rice vinegar, minced garlic, grated ginger, and cornstarch in a small pan. Simmer 2–3 minutes over medium heat until glossy and slightly thickened.", timeMin: 5 },
      { text: "Pat salmon dry and place skin-side down on baking sheet. Brush generously with half the teriyaki sauce. Bake at 400°F for 12–15 minutes until salmon flakes easily.", timeMin: 15 },
      { text: "Spread broccoli florets on a second baking sheet, drizzle with olive oil and pinch of salt, roast alongside salmon for the last 10 minutes.", timeMin: 10 },
      { text: "Divide rice into meal prep containers. Add salmon and broccoli, drizzle remaining teriyaki sauce, and garnish with sesame seeds and sliced green onions.", timeMin: 5 },
    ],
    sourceUrl: "",
    sourceType: "",
  },
  {
    id: 1004,
    title: "Black Bean & Sweet Potato Taco Bowl",
    description: "A hearty plant-based bowl with roasted sweet potato, seasoned black beans, cilantro-lime rice, fresh avocado, and a zesty chipotle-lime crema. Ready in 35 minutes.",
    category: "lunch",
    image: null,
    cuisine: "Mexican",
    difficulty: "beginner",
    prepTime: 10,
    cookTime: 25,
    totalTime: 35,
    servings: 4,
    spiceLevel: 1,
    nutrition: { calories: 440, protein: 15, carbs: 72, fat: 13 },
    tags: ["Vegan", "High Fiber", "Gluten-Free", "Dairy-Free", "PCOS-Friendly", "Blood Sugar Stable"],
    goals: ["lose weight", "maintenance"],
    equipment: ["oven", "stove"],
    allergens: [],
    healthBenefits: "Black beans are an excellent source of plant protein and fiber, stabilizing blood sugar levels. Sweet potato provides beta-carotene and slow-digesting carbs. Avocado delivers heart-healthy monounsaturated fats.",
    ingredients: [
      { name: "sweet potatoes", amount: 2, unit: "large", section: "main" },
      { name: "black beans", amount: 2, unit: "cans (15oz)", section: "main" },
      { name: "white rice", amount: 1.5, unit: "cups", section: "main" },
      { name: "avocado", amount: 2, unit: "medium", section: "topping" },
      { name: "cherry tomatoes", amount: 1, unit: "cup", section: "topping" },
      { name: "fresh cilantro", amount: 0.25, unit: "cup", section: "topping" },
      { name: "lime", amount: 2, unit: "medium", section: "topping" },
      { name: "smoked paprika", amount: 1, unit: "tsp", section: "main" },
      { name: "cumin", amount: 1, unit: "tsp", section: "main" },
      { name: "garlic powder", amount: 0.5, unit: "tsp", section: "main" },
      { name: "olive oil", amount: 2, unit: "tbsp", section: "main" },
      { name: "chipotle in adobo", amount: 1, unit: "tbsp", section: "sauce" },
      { name: "vegan mayo", amount: 3, unit: "tbsp", section: "sauce" },
    ],
    steps: [
      { text: "Preheat oven to 425°F (220°C). Cube sweet potatoes into 1-inch pieces, toss with olive oil, smoked paprika, cumin, garlic powder, salt and pepper. Spread on a baking sheet.", timeMin: 8 },
      { text: "Roast sweet potatoes for 22–25 minutes, flipping halfway, until caramelized and fork-tender.", timeMin: 25 },
      { text: "Cook rice according to package directions. Once cooked, stir in juice of 1 lime and chopped cilantro to make cilantro-lime rice.", timeMin: 18 },
      { text: "Drain and rinse black beans, warm in a pan with a pinch of cumin and salt for 3 minutes. Make chipotle crema by blending vegan mayo with chipotle in adobo and juice of half a lime.", timeMin: 5 },
      { text: "Build bowls: rice base, roasted sweet potato, black beans, sliced avocado, halved tomatoes, fresh cilantro, and drizzle of chipotle crema.", timeMin: 5 },
    ],
    sourceUrl: "",
    sourceType: "",
  },
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
const EQUIPMENT_LIST = ["stove","oven","air fryer","rice cooker","blender","microwave","instant pot","none"];
const APPLIANCE_ICONS = {stove:"🍳",oven:"🔥","air fryer":"🌬️","rice cooker":"🍚",blender:"🫙",microwave:"📡","instant pot":"🫕",none:"🙌"};
const APPLIANCE_KEYS: Record<string,string> = {"stove":"appliance.stove","oven":"appliance.oven","air fryer":"appliance.airFryer","rice cooker":"appliance.riceCooker","blender":"appliance.blender","microwave":"appliance.microwave","instant pot":"appliance.instantPot"};
const ALLERGENS_LIST = ["gluten","dairy","eggs","nuts","soy","shellfish"];
const GOALS = ["lose weight","gain muscle","maintenance"];
const GOAL_KEYS: Record<string,string> = {"lose weight":"goal.loseWeight","gain muscle":"goal.gainMuscle","maintenance":"goal.maintenance"};
const TAG_KEYS: Record<string,string> = {"PCOS-Friendly":"tag.pcos","High Protein":"tag.highProtein","Gluten-Free":"tag.glutenFree","Dairy-Free":"tag.dairyFree","Vegan":"tag.vegan","Low Carb":"tag.lowCarb","High Fiber":"tag.highFiber","Low Calorie":"tag.lowCalorie","Anti-Inflammatory":"tag.antiInflammatory","Blood Sugar Stable":"tag.bloodSugarStable","Omega-3 Rich":"tag.omega3","Antioxidant":"tag.antioxidant","Gut Health":"tag.gutHealth","Heart Healthy":"tag.heartHealthy"};

// Ingredient sections — used in RecipeDetail grouping and extraction
const ING_SECTIONS = [
  {key:"main",     label:"Main Ingredients", color:"#5aad8e"},
  {key:"sauce",    label:"For the Sauce",    color:"#5a8fd4"},
  {key:"marinade", label:"Marinade",          color:"#d4875a"},
  {key:"dressing", label:"Dressing",          color:"#a0d0a0"},
  {key:"batter",   label:"Batter / Breading", color:"#c8a8ff"},
  {key:"filling",  label:"Filling",           color:"#f5a623"},
  {key:"topping",  label:"Toppings",          color:"#ffd580"},
  {key:"garnish",  label:"Garnish",           color:"#c06090"},
];
// Infer section from ingredient name when no section field is stored (backward compat)
const inferIngSection = name => {
  const n = (name||"").toLowerCase();
  if (/\bsauce\b|gravy|glaze|salsa|chutney|pesto|aioli|vinaigrette/.test(n)) return "sauce";
  if (/\bdressing\b/.test(n)) return "dressing";
  if (/\bmarinade\b|marinating/.test(n)) return "marinade";
  if (/\bfilling\b|\bstuffing\b/.test(n)) return "filling";
  if (/\bbatter\b|\bbreading\b|coating/.test(n)) return "batter";
  if (/\btopping\b|whipped cream|shaved|candied|crumble/.test(n)) return "topping";
  if (/\bgarnish\b|sprinkle|for garnish|to garnish/.test(n)) return "garnish";
  return "main";
};
const DIFFICULTIES = {beginner:{label:"Beginner",color:"#5aad8e",icon:"\u{1F331}"},intermediate:{label:"Intermediate",color:"#d4875a",icon:"\u{1F373}"},advanced:{label:"Advanced",color:"#c06090",icon:"\u{1F468}\u200D\u{1F373}"}};
const TAG_COLORS = {"PCOS-Friendly":"#c06090","High Protein":"#3a7d5e","Dairy-Free":"#d4875a","Gluten-Free":"#5a8fd4","Vegan":"#6db85a","Low Carb":"#b8a23e","High Fiber":"#7b6cd4","Low Calorie":"#3eabb8"};
const HEALTH_COLORS = {"Anti-Inflammatory":"#e07a40","Blood Sugar Stable":"#5aad8e","Omega-3 Rich":"#5a8fd4","Antioxidant":"#9b5aad","Gut Health":"#ad8e5a","Heart Healthy":"#e05a6a"};
const ALL_TAG_COLORS = {...TAG_COLORS,...HEALTH_COLORS};
const STEP_COLORS = ["#3a7d5e","#5a8fd4","#d4875a","#c06090","#6db85a","#b8a23e","#7b6cd4","#3eabb8"];
const SPICE_LABELS = ["No Spice","Mild","Medium","Hot","Very Hot","Extreme 🔥"];
const SPICE_KEYS = ['spice.none','spice.mild','spice.medium','spice.hot','spice.veryHot','spice.extreme'];
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
    if (res.status === 400 && (errText.includes("credit_balance_too_low") || errText.toLowerCase().includes("credit balance") || errText.toLowerCase().includes("too low"))) throw new Error("LOW_CREDITS");
    throw new Error("HTTP " + res.status + ": " + errText.slice(0, 200));
  }
}

/** Convert any Anthropic API error into a short, user-friendly string */
function friendlyApiError(e) {
  if (!e) return "Unknown error";
  if (e.message === "NO_KEY") return "No API key — click ⚙️ and add your Anthropic key first.";
  if (e.message === "RATE_LIMIT") return "Rate limit hit — wait 60 seconds and try again.";
  if (e.message === "INVALID_KEY") return "Invalid API key — re-enter it in ⚙️ Settings.";
  if (e.message === "LOW_CREDITS") return "Anthropic API credits exhausted — top up at console.anthropic.com → Billing.";
  if (e.message?.startsWith("HTTP ")) return "API error — check your key and billing at console.anthropic.com.";
  return e.message || "Unexpected error";
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
  let text = null, ogImg = null, schemaRecipe = null;

  // 0. Server-side route — no CORS, real browser headers, extracts schema.org Recipe
  try {
    const res = await fetch(`/api/fetch-page?url=${encodeURIComponent(url)}`, {signal:AbortSignal.timeout(18000)});
    if (res.ok) {
      const d = await res.json();
      if (d.text && d.text.length > 300) {
        text = d.text; ogImg = d.ogImg || null; schemaRecipe = d.schemaRecipe || null;
      }
    }
  } catch(e) {}

  // 1. Fallback: Jina Reader (client-side)
  if (!text) {
    try {
      const jinaRes = await fetch(`https://r.jina.ai/${url}`, {
        signal: AbortSignal.timeout(12000),
        headers: { Accept: 'text/plain' }
      });
      if (jinaRes.ok) {
        const t = await jinaRes.text();
        if (t && t.length > 300) text = t.slice(0, 20000);
      }
    } catch(e) {}
  }

  // 2. Fallback: allorigins proxy
  if (!text) {
    try {
      const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, {signal:AbortSignal.timeout(10000)});
      if (res.ok) {
        const d = await res.json();
        const html = d.contents || '';
        ogImg = ogImg || (html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i) || html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:image"/i) || [])[1] || null;
        // Try to extract schema.org Recipe from fallback HTML too
        if (!schemaRecipe) {
          const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
          let m; while ((m = re.exec(html)) !== null) {
            try {
              const data = JSON.parse(m[1]);
              const items = Array.isArray(data) ? data : data['@graph'] ? data['@graph'] : [data];
              const r = items.find(i => i['@type']==='Recipe' || (Array.isArray(i['@type'])&&i['@type'].includes('Recipe')));
              if (r) { schemaRecipe = r; break; }
            } catch(e2) {}
          }
        }
        text = html.replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,20000);
      }
    } catch(e) {}
  }

  // 3. Fallback: corsproxy.io
  if (!text) {
    try {
      const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`, {signal:AbortSignal.timeout(10000)});
      if (res.ok) {
        const html = await res.text();
        if (!ogImg) ogImg = (html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i)||[])[1]||null;
        if (!schemaRecipe) {
          const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
          let m; while ((m = re.exec(html)) !== null) {
            try {
              const data = JSON.parse(m[1]);
              const items = Array.isArray(data) ? data : data['@graph'] ? data['@graph'] : [data];
              const r = items.find(i => i['@type']==='Recipe' || (Array.isArray(i['@type'])&&i['@type'].includes('Recipe')));
              if (r) { schemaRecipe = r; break; }
            } catch(e2) {}
          }
        }
        text = html.replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,20000);
      }
    } catch(e) {}
  }

  return text ? {text, ogImg, schemaRecipe} : null;
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
  "ingredients": [{"name": "Chicken Breast", "amount": 2, "unit": "pcs", "section": "main"}],
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
- Each ingredient must include "section": one of main, sauce, marinade, dressing, batter, filling, topping, garnish
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

/** Try to repair a truncated JSON string by closing open structures */
function repairJson(s) {
  // Remove trailing comma before attempting close
  let t = s.replace(/,\s*$/, '');
  const opens = [];
  let inStr = false, esc = false;
  for (const ch of t) {
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (!inStr) {
      if (ch === '{' || ch === '[') opens.push(ch);
      else if (ch === '}' || ch === ']') opens.pop();
    }
  }
  // Close any unclosed string first
  if (inStr) t += '"';
  // Close open structures in reverse
  for (let i = opens.length - 1; i >= 0; i--) {
    t += opens[i] === '{' ? '}' : ']';
  }
  return t;
}

async function aiExtractRecipe(input) {
  const isUrl = input.trim().startsWith("http");
  const src = isUrl ? (input.includes("tiktok")?"TikTok video":input.includes("instagram")?"Instagram reel":input.includes("youtu")?"YouTube video":"recipe webpage") : "text description";
  const tagList = ALL_TAGS.join(", ");

  let pageText = null, pageImage = null, schemaRecipe = null;
  if (isUrl) {
    const page = await fetchPageContent(input.trim());
    if (page) { pageText = page.text; pageImage = page.ogImg; schemaRecipe = page.schemaRecipe || null; }
  }

  // Build the source block — schema.org data is compact and authoritative, prefer it
  let sourceBlock = "";
  if (schemaRecipe) {
    const compact = JSON.stringify(schemaRecipe).slice(0, 14000);
    sourceBlock = `\n━━━ SCHEMA.ORG RECIPE DATA (USE AS GROUND TRUTH) ━━━\n${compact}\n━━━ END DATA ━━━\n\n🚨 STRICT EXTRACTION RULES:\n1. Use the ingredient list EXACTLY as it appears in the schema data.\n2. Use the instruction steps EXACTLY — do not paraphrase.\n3. Parse ISO durations (e.g. PT30M = 30 minutes).\n4. Include every ingredient group / section.`;
  } else if (pageText) {
    sourceBlock = `\n━━━ PAGE CONTENT (GROUND TRUTH) ━━━\n${pageText}\n━━━ END PAGE CONTENT ━━━\n\n🚨 STRICT VERBATIM EXTRACTION RULES:\n1. Copy ingredient names EXACTLY as they appear on the page.\n2. Copy amounts and units EXACTLY as written.\n3. Do NOT substitute, paraphrase, or replace any ingredient.\n4. Include EVERY ingredient section (SAUCE, MARINADE, TOPPINGS, etc.).\n5. Do not stop early — include all optional/garnish ingredients too.`;
  } else if (isUrl) {
    sourceBlock = "\nPage could not be fetched — use your culinary knowledge to infer a realistic full recipe from the URL.";
  }

  const prompt = `Extract a COMPLETE recipe from this ${src}. Include every ingredient and step — do not skip or truncate.
${isUrl ? "SOURCE URL: " + input : "DESCRIPTION: " + input}
${sourceBlock}

Respond with ONLY a valid JSON object (no markdown, no extra text):

{"title":"","category":"lunch","tags":[],"allergens":[],"equipment":[],"type":{"protein":false,"grain":false,"side":false},"nutrition":{"calories":0,"protein":0,"carbs":0,"fat":0},"goal":[],"prepTime":0,"cookTime":0,"totalTime":0,"servings":2,"description":"","ingredients":[{"name":"","amount":0,"unit":"","section":"main"}],"steps":[{"text":"","timeMin":0,"image":null,"imagePrompt":""}],"sourceUrl":"${isUrl?input:""}","sourceType":"${src}","difficulty":"beginner","healthBenefits":"","antiInflammatory":false,"bloodSugarFriendly":false}

RULES:
- category: breakfast, lunch, dessert, or drink
- tags from: ${tagList}
- allergens from: ${ALLERGENS_LIST.join(", ")}
- equipment from: ${EQUIPMENT_LIST.join(", ")}
- goal from: ${GOALS.join(", ")}
- INCLUDE ALL ingredients — no truncation. All sections, all toppings, all garnishes.
- INCLUDE ALL steps — zero omissions. Every temperature, time, and technique must appear. Group closely related actions into one step (2–3 actions max per step). Write each step as 1–2 short sentences — keep the wording tight and scannable but do NOT remove any cooking detail. Example: "Season chicken with salt and pepper. Heat oil over medium-high until shimmering, then sear 6 min per side until 165°F internal." Never skip or summarise any instruction.
- Each ingredient must have a "section": main, sauce, marinade, dressing, batter, filling, topping, or garnish.
- difficulty: beginner, intermediate, or advanced
- healthBenefits: ALWAYS fill this in — describe the key nutritional or health benefits of this dish in 1-2 sentences (e.g. protein content, anti-inflammatory ingredients, fibre, vitamins).
- servings: set to the ACTUAL number of servings the original recipe makes. Ingredient amounts must match that serving count exactly.`;

  const raw = await anthropicCall({
    max_tokens: 8000,
    system: "You are a culinary AI. Output ONLY a single valid JSON object starting with { and ending with }. No markdown fences, no extra text.",
    messages: [{role:"user",content:prompt}]
  });

  const stripped = raw.replace(/^```(?:json)?\s*/im,"").replace(/\s*```\s*$/im,"").trim();
  const jStart = stripped.indexOf("{"), jEnd = stripped.lastIndexOf("}");
  if (jStart===-1) throw new Error("No JSON found in AI response");
  let jsonStr = jEnd !== -1 ? stripped.slice(jStart, jEnd+1) : stripped.slice(jStart);

  let recipe;
  try {
    recipe = JSON.parse(jsonStr);
  } catch(e1) {
    // JSON was likely truncated — attempt repair
    try {
      recipe = JSON.parse(repairJson(jsonStr));
    } catch(e2) {
      throw new Error("Could not parse recipe JSON: " + e1.message);
    }
  }

  recipe.totalTime = recipe.totalTime || (recipe.prepTime||0) + (recipe.cookTime||0);
  if (recipe.antiInflammatory && !(recipe.tags||[]).includes("Anti-Inflammatory")) recipe.tags = [...(recipe.tags||[]), "Anti-Inflammatory"];
  if (recipe.bloodSugarFriendly && !(recipe.tags||[]).includes("Blood Sugar Stable")) recipe.tags = [...(recipe.tags||[]), "Blood Sugar Stable"];
  if (pageImage && !recipe.image) recipe.image = pageImage;

  // Normalize to 1 serving so planner can scale correctly
  const origServings = Math.max(1, recipe.servings || 1);
  if (origServings > 1) {
    const round2 = n => Math.round((n / origServings) * 100) / 100;
    recipe.ingredients = (recipe.ingredients || []).map(ing => ({
      ...ing,
      amount: ing.amount ? round2(ing.amount) : ing.amount,
    }));
    if (recipe.nutrition) {
      recipe.nutrition = {
        calories: Math.round((recipe.nutrition.calories || 0) / origServings),
        protein:  Math.round((recipe.nutrition.protein  || 0) / origServings),
        carbs:    Math.round((recipe.nutrition.carbs    || 0) / origServings),
        fat:      Math.round((recipe.nutrition.fat      || 0) / origServings),
      };
    }
    recipe.servings = 1;
  }

  return {...recipe, id:Date.now(), _pageText: pageText || null};
}

// ─── PDF EXPORT ──────────────────────────────────────────────────────────────

// Weekly cook streak: consecutive ISO-weeks (Mon–Sun) with ≥1 cook session
const weekKey = d => {
  const dt = new Date(d); const day = dt.getDay()||7;
  dt.setDate(dt.getDate()+4-day);
  const y1 = new Date(dt.getFullYear(),0,1);
  return dt.getFullYear()+'-W'+Math.ceil(((dt-y1)/86400000+1)/7);
};
const computeWeeklyStreak = log => {
  if (!log || log.length===0) return 0;
  const weeks = new Set(log.map(l=>weekKey(l.date)));
  let streak=0; const check=new Date();
  while (weeks.has(weekKey(check))) { streak++; check.setDate(check.getDate()-7); }
  return streak;
};
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

async function exportRecipeToPDF(recipe, scale, lang='en') {
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
    ${[[t('label.calories',lang),Math.round(recipe.nutrition.calories*r),""],[ t('label.protein',lang),Math.round(recipe.nutrition.protein*r),"g"],[t('label.carbs',lang),Math.round(recipe.nutrition.carbs*r),"g"],[t('label.fat',lang),Math.round(recipe.nutrition.fat*r),"g"]].map(([l,v,u])=>`<div class="nbox"><div class="nval">${v}${u}</div><div class="nlbl">${l}</div></div>`).join("")}
  </div>
  <div class="stitle">${t('pdf.ingredients',lang)} <small style="font-weight:400;color:#888">(${s} ${t('label.servings',lang).toLowerCase()})</small></div>
  ${ingOverallB64 ? `<div class="ing-overall-wrap"><img src="${ingOverallB64}" class="ing-overall" alt="All ingredients"/></div>` : ""}
  ${(()=>{
    const ings = (recipe.ingredients||[]).map((ing,i)=>({...ing,_i:i,_sec:ing.section||inferIngSection(ing.name)}));
    const order = ING_SECTIONS.map(s=>s.key);
    const groups = {};
    ings.forEach(ing=>{ (groups[ing._sec]||(groups[ing._sec]=[])).push(ing); });
    const multi = Object.keys(groups).length > 1;
    return [...order,...Object.keys(groups).filter(k=>!order.includes(k))].filter(k=>groups[k]).map(k=>{
      const meta = ING_SECTIONS.find(s=>s.key===k);
      return `${multi?`<div style="font-size:11px;font-weight:700;color:${meta?.color||"#888"};letter-spacing:1px;text-transform:uppercase;padding:10px 0 4px;margin-top:4px;border-bottom:1px solid #eee">${getSectionLabel(k, lang)}</div>`:""}`+
        groups[k].map((ing)=>`<div class="ing">
          ${ingB64s[ing._i] ? `<img src="${ingB64s[ing._i]}" class="ing-thumb" alt="${ing.name}"/>` : `<div class="ing-emoji">${getItemEmoji(ing.name)}</div>`}
          <span class="ing-name">${ing.name}</span>
          <span class="amt">${scaleAmt(ing.amount,r)} ${ing.unit}</span>
        </div>`).join("");
    }).join("");
  })()}
  <div class="stitle">${t('pdf.steps',lang)}</div>
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

async function exportMealBookToPDF(recipes, title, lang='en') {
  const win = window.open("","_blank");
  if (!win) { alert("Please allow pop-ups for this site to export PDFs."); return; }
  const bookTitle = title || "My Recipe Book";
  const totalRecipes = recipes.length;
  const tl = (key, rep?) => { let s = TRANSLATIONS[lang]?.[key] || TRANSLATIONS['en'][key] || key; if(rep) Object.entries(rep).forEach(([k,v])=>{s=s.replace(`{${k}}`,String(v));}); return s; };

  const spinHtml = (msg) => `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Loading…</title>
  <style>body{display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:'Segoe UI',sans-serif;color:#888;flex-direction:column;gap:14px}
  .sp{width:40px;height:40px;border:4px solid #eee;border-top-color:#3a7d5e;border-radius:50%;animation:sp .8s linear infinite}
  @keyframes sp{to{transform:rotate(360deg)}}</style></head>
  <body><div class="sp"></div><div>${msg}</div></body></html>`;

  win.document.write(spinHtml(tl('pdf.building', {n: totalRecipes})));
  win.document.close();

  // Batch-translate uncached recipes before generating
  if (lang !== 'en') {
    const needTranslation = recipes.filter(r => r?.id && !localStorage.getItem(`mpm_recipe_translation_${r.id}_${lang}`));
    if (needTranslation.length > 0) {
      win.document.open();
      win.document.write(spinHtml(tl('pdf.translating', {n: needTranslation.length})));
      win.document.close();
      const BATCH = 2;
      for (let i = 0; i < needTranslation.length; i += BATCH) {
        const batch = needTranslation.slice(i, i + BATCH);
        try { await translateRecipesBatch(batch, lang); } catch(e) {}
        if (i + BATCH < needTranslation.length) await new Promise(res => setTimeout(res, 800));
        const remaining = Math.max(0, needTranslation.length - i - BATCH);
        if (remaining > 0) {
          win.document.open();
          win.document.write(spinHtml(tl('pdf.translating', {n: remaining})));
          win.document.close();
        }
      }
      // Reload translated versions from cache (merging slim text cache with original images)
      recipes = recipes.map(r => {
        if (!r?.id) return r;
        const cached = localStorage.getItem(`mpm_recipe_translation_${r.id}_${lang}`);
        if (cached) try { return mergeTranslation(r, JSON.parse(cached)); } catch(e) {}
        return r;
      });
      win.document.open();
      win.document.write(spinHtml(tl('pdf.building', {n: totalRecipes})));
      win.document.close();
    }
  }

  // Pre-fetch all images
  const recipeData = await Promise.all(recipes.map(async rec => {
    const heroB64 = await toBase64(rec.image);
    const ingB64s = await Promise.all((rec.ingredients||[]).map(i => toBase64(i.image)));
    const stepImgB64s = await Promise.all((rec.steps||[]).map(step => Promise.all(getStepImages(step).map(toBase64))));
    return {heroB64, ingB64s, stepImgB64s};
  }));

  // Group recipes by category for TOC
  const catOrder = ["breakfast","lunch","dinner","snack","dessert","drink"];
  const grouped = {};
  recipes.forEach(r => { const c = r.category||"other"; (grouped[c]||(grouped[c]=[])).push(r); });

  // Table of contents
  const tocHtml = `
    <div style="page-break-after:always;padding:48px 40px">
      <div style="border-bottom:2px solid #2d5a3d;padding-bottom:16px;margin-bottom:32px">
        <div style="color:#2d5a3d;font-size:11px;letter-spacing:3px;text-transform:uppercase;margin-bottom:6px">${tl('pdf.contents')}</div>
        <h2 style="font-family:Georgia,serif;font-size:28px;margin:0;color:#1a1a1a">${tl('pdf.tableOfContents')}</h2>
      </div>
      ${[...catOrder,...Object.keys(grouped).filter(c=>!catOrder.includes(c))].filter(c=>grouped[c]).map(cat=>`
        <div style="margin-bottom:20px">
          <div style="color:#2d5a3d;font-size:10px;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;font-weight:700">${cat.charAt(0).toUpperCase()+cat.slice(1)}</div>
          ${grouped[cat].map(r=>`
            <div style="display:flex;align-items:baseline;padding:5px 0;border-bottom:1px dotted #ddd">
              <span style="font-size:14px;color:#1a1a1a;flex:1">${r.title}${(r.spiceLevel||0)>0?" 🌶️".repeat(r.spiceLevel):""}</span>
              <span style="color:#888;font-size:12px;white-space:nowrap;margin-left:8px">${r.totalTime||0} min · ${r.servings||1} srv</span>
            </div>`).join("")}
        </div>`).join("")}
    </div>`;

  // Recipe pages
  const STEP_COLORS_PDF = ["#3a7d5e","#d4875a","#5a8fd4","#c06090","#ffd580","#5aad8e","#8b6fc0","#e05a6a"];
  const pages = recipes.map((r,idx)=>{
    const {heroB64, ingB64s, stepImgB64s} = recipeData[idx];
    const nutrition = r.nutrition||{};
    const catLabel = (r.category||"").charAt(0).toUpperCase()+(r.category||"").slice(1);

    return `
    <div style="page-break-before:always;min-height:100vh;display:flex;flex-direction:column">
      <!-- Hero image (full bleed) -->
      ${heroB64
        ? `<div style="position:relative;width:100%;height:280px;overflow:hidden;flex-shrink:0">
             <img src="${heroB64}" style="width:100%;height:100%;object-fit:cover;display:block;print-color-adjust:exact;-webkit-print-color-adjust:exact" alt="${r.title}"/>
             <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,0.75) 0%,transparent 60%)"></div>
             <div style="position:absolute;bottom:0;left:0;right:0;padding:20px 28px">
               <div style="color:rgba(255,255,255,0.7);font-size:10px;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px">${catLabel}${r.cuisine?" · "+r.cuisine:""}</div>
               <h2 style="font-family:Georgia,serif;font-size:26px;color:#fff;margin:0;line-height:1.2;text-shadow:0 1px 4px rgba(0,0,0,0.4)">${r.title}${(r.spiceLevel||0)>0?` ${"🌶️".repeat(r.spiceLevel)}`:""}</h2>
             </div>
           </div>`
        : `<div style="background:linear-gradient(135deg,#2d5a3d,#3a7d5e);padding:36px 28px;flex-shrink:0">
             <div style="color:rgba(255,255,255,0.6);font-size:10px;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px">${catLabel}${r.cuisine?" · "+r.cuisine:""}</div>
             <h2 style="font-family:Georgia,serif;font-size:26px;color:#fff;margin:0;line-height:1.2">${r.title}${(r.spiceLevel||0)>0?` ${"🌶️".repeat(r.spiceLevel)}`:""}</h2>
           </div>`
      }

      <!-- Body -->
      <div style="padding:22px 28px 32px;flex:1">
        <!-- Meta strip -->
        <div style="display:flex;gap:18px;flex-wrap:wrap;padding:10px 16px;background:#f7f7f4;border-radius:10px;margin-bottom:16px;font-size:12px;color:#555">
          <span>⏱ <b>${r.prepTime||0}</b>m prep</span>
          <span>🔥 <b>${r.cookTime||0}</b>m cook</span>
          <span>⏰ <b>${r.totalTime||0}</b>m total</span>
          <span>🍽 <b>${r.servings||1}</b> servings</span>
          ${r.difficulty?`<span>📊 ${r.difficulty}</span>`:""}
          ${(r.equipment||[]).length?`<span>🔧 ${r.equipment.join(", ")}</span>`:""}
        </div>

        <!-- Health note -->
        ${r.healthBenefits ? `<div style="background:#e8f5e9;border-left:3px solid #4caf50;padding:8px 12px;border-radius:0 8px 8px 0;font-size:12px;color:#2e7d32;margin-bottom:14px">${r.healthBenefits}</div>` : ""}

        <!-- Tags -->
        ${(r.tags||[]).length ? `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:14px">${(r.tags||[]).map(t=>`<span style="background:#e8f5e9;color:#2d5a3d;border-radius:20px;padding:2px 9px;font-size:11px">${t}</span>`).join("")}</div>` : ""}

        <!-- Nutrition row -->
        ${(nutrition.calories||nutrition.protein) ? `
        <div style="display:flex;gap:0;border:1px solid #e8e8e8;border-radius:10px;overflow:hidden;margin-bottom:18px">
          ${[[tl('label.calories'),nutrition.calories||0,"kcal","#e05a6a"],[tl('label.protein'),nutrition.protein||0,"g","#5aad8e"],[tl('label.carbs'),nutrition.carbs||0,"g","#5a8fd4"],[tl('label.fat'),nutrition.fat||0,"g","#d4875a"]].map(([l,v,u,c])=>`
            <div style="flex:1;text-align:center;padding:10px 6px;border-right:1px solid #e8e8e8">
              <div style="font-size:18px;font-weight:700;color:${c}">${Math.round(v)}${u}</div>
              <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.5px">${l}</div>
            </div>`).join("")}
        </div>` : ""}

        <!-- Two columns: ingredients + steps -->
        <div style="display:grid;grid-template-columns:2fr 3fr;gap:22px">
          <!-- Ingredients -->
          <div>
            <div style="font-family:Georgia,serif;font-size:15px;font-weight:700;color:#1a1a1a;border-bottom:2px solid #2d5a3d;padding-bottom:5px;margin-bottom:10px">${tl('pdf.ingredients')}</div>
            <div style="font-size:11px;color:#666;margin-bottom:10px">${(r.servings||1)===1?tl('pdf.servingsLabel',{n:1}):tl('pdf.servingsPluralLabel',{n:r.servings||1})}</div>
            ${(r.ingredients||[]).map((ing,i)=>`
              <div style="display:flex;align-items:center;gap:7px;padding:5px 0;border-bottom:1px solid #f0f0f0">
                ${ingB64s[i] ? `<img src="${ingB64s[i]}" style="width:28px;height:28px;border-radius:5px;object-fit:cover;flex-shrink:0;print-color-adjust:exact;-webkit-print-color-adjust:exact"/>` : `<span style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">${getItemEmoji(ing.name)}</span>`}
                <span style="flex:1;font-size:12px;color:#333">${ing.name}</span>
                <span style="font-size:11px;font-weight:700;color:#2d5a3d;white-space:nowrap">${ing.amount} ${ing.unit}</span>
              </div>`).join("")}
          </div>

          <!-- Steps -->
          <div>
            <div style="font-family:Georgia,serif;font-size:15px;font-weight:700;color:#1a1a1a;border-bottom:2px solid #2d5a3d;padding-bottom:5px;margin-bottom:10px">${tl('pdf.instructions')}</div>
            ${(r.steps||[]).map((step,i)=>{
              const imgs = stepImgB64s[i].filter(Boolean);
              const col = STEP_COLORS_PDF[i % STEP_COLORS_PDF.length];
              return `
              <div style="margin-bottom:12px">
                ${imgs.length===1 ? `<div style="margin-bottom:5px;border-radius:7px;overflow:hidden;text-align:center;background:#f5f5f5"><img src="${imgs[0]}" style="max-width:100%;max-height:140px;width:auto;height:auto;display:inline-block;print-color-adjust:exact;-webkit-print-color-adjust:exact" alt=""/></div>` : imgs.length>1 ? `<div style="display:flex;gap:4px;margin-bottom:5px">${imgs.map(b=>`<div style="flex:1;border-radius:5px;overflow:hidden;background:#f5f5f5;text-align:center"><img src="${b}" style="max-width:100%;max-height:100px;width:auto;height:auto;display:inline-block;print-color-adjust:exact;-webkit-print-color-adjust:exact" alt=""/></div>`).join("")}</div>` : ""}
                <div style="display:flex;gap:8px;align-items:flex-start">
                  <div style="min-width:22px;height:22px;border-radius:50%;background:${col};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;flex-shrink:0;margin-top:1px">${i+1}</div>
                  <div style="flex:1">
                    <div style="font-size:12px;color:#333;line-height:1.5">${step.text}</div>
                    ${step.timeMin ? `<div style="color:#888;font-size:10px;margin-top:2px">⏱ ${step.timeMin} min</div>` : ""}
                  </div>
                </div>
              </div>`;
            }).join("")}
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div style="border-top:1px solid #e8e8e8;padding:8px 28px;display:flex;justify-content:space-between;font-size:10px;color:#aaa;flex-shrink:0">
        <span>${bookTitle}</span>
        <span>${idx+1} / ${totalRecipes}</span>
      </div>
    </div>`;
  }).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${bookTitle}</title>
  <style>
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{font-family:'Georgia','Times New Roman',serif;max-width:800px;margin:0 auto;color:#1a1a1a;background:#fff}
    @media print{
      body{max-width:none;margin:0}
      button{display:none!important}
      img{print-color-adjust:exact!important;-webkit-print-color-adjust:exact!important;max-width:100%!important}
      div[style*="page-break"]{page-break-before:always}
    }
  </style></head><body>

  <!-- COVER PAGE -->
  <div style="page-break-after:always;min-height:100vh;background:linear-gradient(160deg,#1a3828 0%,#2d5a3d 50%,#1a3828 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 40px;position:relative;overflow:hidden">
    <!-- decorative circles -->
    <div style="position:absolute;top:-60px;right:-60px;width:280px;height:280px;border-radius:50%;border:2px solid rgba(255,255,255,0.06)"></div>
    <div style="position:absolute;top:-30px;right:-30px;width:180px;height:180px;border-radius:50%;border:2px solid rgba(255,255,255,0.08)"></div>
    <div style="position:absolute;bottom:-80px;left:-80px;width:360px;height:360px;border-radius:50%;border:2px solid rgba(255,255,255,0.05)"></div>
    <!-- emblem -->
    <div style="width:100px;height:100px;border-radius:50%;background:rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;font-size:52px;margin-bottom:32px;backdrop-filter:blur(4px)">🥗</div>
    <!-- title -->
    <div style="color:rgba(255,255,255,0.5);font-size:11px;letter-spacing:4px;text-transform:uppercase;margin-bottom:14px;font-family:'Segoe UI',sans-serif">${tl('pdf.collection')}</div>
    <h1 style="font-family:Georgia,serif;font-size:42px;color:#fff;margin:0 0 10px;text-align:center;line-height:1.2;font-weight:700">${bookTitle}</h1>
    <div style="width:60px;height:2px;background:rgba(255,255,255,0.3);margin:18px auto 22px"></div>
    <div style="color:rgba(255,255,255,0.65);font-size:16px;margin-bottom:6px;font-family:'Segoe UI',sans-serif">${tl('pdf.handPicked',{n:totalRecipes})}</div>
    <div style="color:rgba(255,255,255,0.4);font-size:13px;font-family:'Segoe UI',sans-serif">${tl('pdf.created')} ${new Date().toLocaleDateString(lang==='ru'?'ru-RU':lang==='es'?'es-ES':'en-US',{year:"numeric",month:"long",day:"numeric"})}</div>
    <!-- bottom bar -->
    <div style="position:absolute;bottom:0;left:0;right:0;height:5px;background:linear-gradient(90deg,#5aad8e,#3a7d5e,#5a8fd4)"></div>
  </div>

  <!-- TABLE OF CONTENTS -->
  ${tocHtml}

  <!-- RECIPES -->
  ${pages}

  <!-- PRINT BUTTON (hidden when printing) -->
  <div style="text-align:center;padding:32px">
    <button onclick="window.print()" style="background:#2d5a3d;color:#fff;border:none;border-radius:10px;padding:14px 32px;font-size:15px;cursor:pointer;font-family:'Segoe UI',sans-serif;font-weight:700;letter-spacing:.5px">${tl('pdf.printSave')}</button>
  </div>
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
function RecipeCard({recipe, onClick, onFavorite, isFavorite, costPerServing, language='en'}) {
  const total = recipe.totalTime || (recipe.prepTime||0) + (recipe.cookTime||0);
  const isHealth = (recipe.tags||[]).some(t => HEALTH_TAGS.includes(t));
  return (
    <div style={{background:"var(--bg-card)",boxShadow:isHealth?"var(--nm-raised),0 0 0 2px var(--accent)30":"var(--nm-raised)",borderRadius:18,overflow:"hidden",transition:"all .2s",position:"relative",cursor:"pointer"}}
      onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-4px)";e.currentTarget.style.boxShadow="var(--nm-inset)";}}
      onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow=isHealth?"var(--nm-raised),0 0 0 2px var(--accent)30":"var(--nm-raised)";}}>
      <div onClick={()=>onClick(recipe)}>
        <div style={{position:"relative",height:180}}>
          <SmartImage recipe={recipe} style={{width:"100%",height:"100%"}}/>
          <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(0,0,0,.92) 0%,rgba(0,0,0,.45) 40%,transparent 65%)"}}/>
          <span style={{position:"absolute",top:9,left:9,background:"rgba(0,0,0,.75)",color:"#ffd580",fontSize:10,padding:"3px 8px",borderRadius:8,fontWeight:700}}>
            {(CATEGORIES.find(c=>c.id===recipe.category)||{}).icon} {recipe.category}
          </span>
          {total > 0 && <span style={{position:"absolute",top:9,right:9,background:"rgba(0,0,0,.75)",color:"#5aad8e",fontSize:11,padding:"3px 9px",borderRadius:8,fontWeight:700}}>{total}min</span>}
          <div style={{position:"absolute",bottom:10,left:12,right:12}}>
            <div style={{color:"#fff",fontWeight:700,fontSize:14,fontFamily:"'Playfair Display',serif",lineHeight:1.3,textShadow:"0 1px 4px rgba(0,0,0,0.9),0 2px 8px rgba(0,0,0,0.7)"}}>{recipe.title}</div>
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
            {(recipe.tags||[]).slice(0,2).map(tag=><TagChip key={tag} label={t(TAG_KEYS[tag]||tag,language)} color={ALL_TAG_COLORS[tag]||"#888"}/>)}
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
            <span>{recipe.servings} serving{recipe.servings!==1?"s":""}</span>
            {(recipe.spiceLevel||0) > 0 && <span style={{color:"#e05050"}}>{"🌶".repeat(recipe.spiceLevel)}</span>}
          </div>
          {recipe.healthBenefits && <div style={{marginTop:7,fontSize:11,color:"#5aad8e",lineHeight:1.4,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>💚 {recipe.healthBenefits}</div>}
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
function RecipeDetail({recipe:init, onClose, onFavorite, isFavorite, onRate, ratings, onEdit, onMarkCooked, onIngredientTap, language='en', onTranslated=null}) {
  const [recipe, setRecipe] = useState(init);
  const [scale, setScale] = useState(init.servings||1);
  // Sync local state when translated prop arrives (title change = new translation)
  useEffect(() => { if (init.id === recipe.id && init.title !== recipe.title) setRecipe(init); }, [init.title]);
  useEffect(() => { if (init.id !== recipe.id) { setRecipe(init); setScale(init.servings||1); } }, [init.id]);
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
            <button onClick={()=>exportRecipeToPDF(recipe,scale,language)} style={{background:"rgba(0,0,0,0.7)",border:"none",borderRadius:10,color:"#c8d0dc",cursor:"pointer",padding:"6px 12px",fontSize:12,fontFamily:"inherit"}}>PDF</button>
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
            {(recipe.tags||[]).map(tag=><TagChip key={tag} label={t(TAG_KEYS[tag]||tag,language)} color={ALL_TAG_COLORS[tag]||"#888"}/>)}
            {(recipe.allergens||[]).map(a=>{const ak=t('allergen.'+a.toLowerCase(),language);return <TagChip key={a} label={"⚠ "+(ak.includes('.')?a:ak)} color="#c05050"/>;})}
          </div>

          {recipe.healthBenefits && <div style={{background:"rgba(58,125,94,0.1)",border:"1px solid rgba(58,125,94,0.25)",borderRadius:10,padding:"10px 14px",marginBottom:14,color:"#5aad8e",fontSize:13}}>💚 {recipe.healthBenefits}</div>}

          {/* Nutrition + Scale */}
          <div style={{display:"flex",gap:12,marginBottom:18,flexWrap:"wrap",alignItems:"center"}}>
            <NutriBadge n={{calories:Math.round(recipe.nutrition.calories*r),protein:Math.round(recipe.nutrition.protein*r),carbs:Math.round(recipe.nutrition.carbs*r),fat:Math.round(recipe.nutrition.fat*r)}}/>
            <div style={{display:"flex",alignItems:"center",gap:8,marginLeft:"auto"}}>
              <span style={{color:"#6a7a90",fontSize:12}}>{t('label.servings',language)}:</span>
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
                <h3 style={{color:"#c8d0dc",fontSize:13,fontWeight:700,letterSpacing:.8,textTransform:"uppercase",margin:0}}>{t('label.ingredients', language)}</h3>
                <button onClick={()=>ingOverallRef.current?.click()} style={{background:"rgba(90,143,212,0.15)",border:"1px solid rgba(90,143,212,0.3)",borderRadius:7,color:"#7ab0f0",padding:"3px 9px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>📷 {t('btn.allIngredients', language)}</button>
              </div>
              <input ref={ingOverallRef} type="file" accept="image/*" style={{display:"none"}} onChange={uploadIngOverall}/>
              {recipe.ingredientsImage && (
                <div style={{position:"relative",marginBottom:10,borderRadius:10,overflow:"hidden"}}>
                  <img src={recipe.ingredientsImage} alt="All ingredients" style={{width:"100%",maxHeight:220,objectFit:"contain",display:"block",background:"rgba(0,0,0,0.25)",borderRadius:8}}/>
                  <div style={{position:"absolute",top:5,right:5,display:"flex",gap:4}}>
                    <button onClick={()=>ingOverallRef.current?.click()} style={{background:"rgba(0,0,0,0.65)",border:"none",borderRadius:7,color:"#fff",padding:"3px 8px",fontSize:11,cursor:"pointer"}}>📷 {t('edit.change',language)}</button>
                    <button onClick={()=>setRecipe(p=>({...p,ingredientsImage:null}))} style={{background:"rgba(180,40,40,0.75)",border:"none",borderRadius:7,color:"#fff",padding:"3px 8px",fontSize:11,cursor:"pointer"}}>🗑</button>
                  </div>
                </div>
              )}
              {(()=>{
                const ings = recipe.ingredients||[];
                // Resolve section for each ingredient (stored field → infer from name)
                const resolved = ings.map((ing,i)=>({...ing, _sec: ing.section || inferIngSection(ing.name), _i: i}));
                // Build ordered section groups
                const sectionOrder = ING_SECTIONS.map(s=>s.key);
                const groups = {};
                resolved.forEach(ing=>{ (groups[ing._sec]||(groups[ing._sec]=[])).push(ing); });
                const orderedGroups = sectionOrder.filter(k=>groups[k]).map(k=>({key:k,items:groups[k]}));
                // Any sections not in ING_SECTIONS go last
                Object.keys(groups).filter(k=>!sectionOrder.includes(k)).forEach(k=>orderedGroups.push({key:k,items:groups[k]}));
                const multiSection = orderedGroups.length > 1;
                return orderedGroups.map(({key, items})=>{
                  const secMeta = ING_SECTIONS.find(s=>s.key===key);
                  return (
                    <div key={key}>
                      {multiSection && (
                        <div style={{color:secMeta?.color||"#8a9bb0",fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",padding:"8px 0 4px",marginTop:key!==orderedGroups[0].key?8:0,borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
                          {getSectionLabel(key, language)}
                        </div>
                      )}
                      {items.map((ing)=>(
                        <div key={ing._i}>
                          <input ref={el=>ingImgRefs.current[ing._i]=el} type="file" accept="image/*" style={{display:"none"}} onChange={e=>uploadIngImg(ing._i,e)}/>
                          <div style={{display:"flex",gap:8,padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,0.05)",fontSize:13,alignItems:"center"}}>
                            {ing.image
                              ? <img src={ing.image} alt={ing.name} style={{width:36,height:36,borderRadius:8,objectFit:"cover",flexShrink:0,cursor:"pointer"}} onClick={()=>ingImgRefs.current[ing._i]?.click()} title="Change photo"/>
                              : <button onClick={()=>ingImgRefs.current[ing._i]?.click()} style={{width:36,height:36,borderRadius:8,border:"1px dashed rgba(255,255,255,0.2)",background:"rgba(255,255,255,0.04)",color:"#6a7a90",fontSize:14,cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}} title="Add photo">📷</button>
                            }
                            <span style={{color:"#c8d0dc",flex:1,cursor:onIngredientTap?"pointer":"default",textDecoration:onIngredientTap?"underline dotted":"none"}} onClick={()=>onIngredientTap?.(ing.name)} title={onIngredientTap?"Tap for ingredient info":undefined}>{ing.name}</span>
                            <div style={{display:"flex",gap:6,alignItems:"center"}}>
                              <span style={{color:secMeta?.color||"#5aad8e",fontWeight:600}}>{scaleAmt(ing.amount,r)} {ing.unit}</span>
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
                  );
                });
              })()}
            </div>
            {/* Details */}
            <div>
              <h3 style={{color:"#c8d0dc",fontSize:13,fontWeight:700,letterSpacing:.8,textTransform:"uppercase",marginBottom:10}}>{t('label.details', language)}</h3>
              {([
                [t('label.prep',language), recipe.prepTime+"min"],
                [t('label.cook',language), recipe.cookTime+"min"],
                [t('label.total',language), total+"min"],
                [t('label.servings',language), String(scale)],
                [t('label.calories',language), Math.round(recipe.nutrition.calories*r)+"kcal"],
                [t('label.equipment',language), (recipe.equipment||[]).join(", ")],
                [t('label.spice',language), (recipe.spiceLevel||0)===0?t('label.none',language):"🌶".repeat(recipe.spiceLevel||0)+" "+t(SPICE_KEYS[recipe.spiceLevel||0],language)],
                recipe.cuisine&&[t('label.cuisine',language), "🌍 "+recipe.cuisine]
              ] as [string,string][]).filter(Boolean).map(([k,v])=>(
                <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,0.05)",fontSize:13}}>
                  <span style={{color:"#6a7a90"}}>{k}</span>
                  <span style={{color:"#c8d0dc"}}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Steps */}
          <h3 style={{color:"#c8d0dc",fontSize:13,fontWeight:700,letterSpacing:.8,textTransform:"uppercase",marginBottom:12}}>{t('label.steps', language)}</h3>
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
                <h3 style={{color:"#c8d0dc",fontSize:13,fontWeight:700,letterSpacing:.8,textTransform:"uppercase",marginBottom:10}}>📦 {t('label.container',language)}</h3>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,borderRadius:12,overflow:"hidden",border:"1px solid rgba(255,255,255,0.08)"}}>
                  {[[t('label.containerProtein',language),"#5aad8e",protein],[t('label.containerGrain',language),"#e2d9c8",grain],[t('label.containerVeggies',language),"#d4875a",veggie]].map(([label,color,items])=>(
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
            {onRate && <button onClick={()=>onRate(recipe)} style={{...GB,flex:1}}>{t('btn.rate', language)}</button>}
            {onEdit && <button onClick={onEdit} style={{...GB,flex:1,background:"rgba(90,143,212,0.15)",color:"#5a8fd4"}}>{t('btn.edit', language)}</button>}
            {onMarkCooked && <button onClick={()=>{onMarkCooked(recipe);alert(t('msg.markedCooked', language));}} style={{...GB,flex:1,background:"rgba(90,173,142,0.2)",color:"#5aad8e"}}>{t('btn.markCooked', language)}</button>}
            <button onClick={()=>{
              const mins = parseInt(prompt("Remind me in how many minutes?","30"));
              if (!mins||isNaN(mins)) return;
              if (Notification.permission==="default") Notification.requestPermission();
              setTimeout(()=>{
                try { new Notification("⏰ Time to cook!",{body:"Start cooking: "+recipe.title,icon:"/logo.svg"}); }
                catch(e) { alert("⏰ Time to start cooking: "+recipe.title); }
              }, mins*60*1000);
              alert("⏰ Reminder set for "+mins+" minutes from now!");
            }} style={{...GB,flex:1,background:"rgba(192,96,144,0.15)",color:"#c06090"}}>{t('btn.remind',language)}</button>
            {recipe.sourceUrl && (
              <a href={recipe.sourceUrl} target="_blank" rel="noreferrer" style={{...GB,textDecoration:"none",display:"inline-flex",alignItems:"center",gap:6,background:"rgba(90,143,212,0.15)",border:"1px solid rgba(90,143,212,0.3)",color:"#5a8fd4",flex:1,justifyContent:"center"}}>
                {t('btn.source',language)}
              </a>
            )}
          </div>
        </div>
      </div>
      {cookMode && <CookMode recipe={recipe} onClose={()=>setCookMode(false)} onMarkCooked={onMarkCooked} language={language}/>}
    </div>
  );
}
function EditRecipeModal({recipe:init, onClose, onSave, onDelete, language='en'}) {
  const [data, setData] = useState({...init});
  const mainImgRef = useRef(null);
  const stepImgRefs = useRef({});
  const ingImgRefs = useRef({});
  const ingOverallRef = useRef(null);
  const [imgUrlInput, setImgUrlInput] = useState("");
  const [aiChecking, setAiChecking] = useState(false);
  const [aiCheckStatus, setAiCheckStatus] = useState(""); // "Fetching source…" | "Comparing…"
  const [aiSuggestions, setAiSuggestions] = useState(null); // {missingIngredients, missingSteps, notes}
  const [reimportUrl, setReimportUrl] = useState("");
  const [reimporting, setReimporting] = useState(false);
  const [reimportError, setReimportError] = useState(null);
  const reimportFileRef = useRef(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const doReimport = async (inputVal) => {
    if (!inputVal?.trim()) return;
    setReimporting(true); setReimportError(null);
    try {
      const fresh = await aiExtractRecipe(inputVal.trim());
      delete fresh._pageText;

      // Build lookup maps from existing recipe for name-based image matching
      const oldIngMap = {};
      (data.ingredients||[]).forEach(ing => { if (ing.image) oldIngMap[(ing.name||"").toLowerCase()] = ing.image; });
      // For steps: find best-matching old step by shared keywords
      const findStepImg = (newText) => {
        const words = (newText||"").toLowerCase().split(/\W+/).filter(w=>w.length>3);
        let best = null, bestScore = 0;
        (data.steps||[]).forEach(st => {
          if (!st.image) return;
          const score = words.filter(w=>(st.text||"").toLowerCase().includes(w)).length;
          if (score > bestScore) { bestScore = score; best = st.image; }
        });
        return bestScore >= 2 ? best : null;
      };

      const keepImages = {
        image: data.image || fresh.image,
        ingredients: (fresh.ingredients||[]).map(ing => ({
          ...ing,
          image: oldIngMap[(ing.name||"").toLowerCase()] || ing.image || null,
        })),
        steps: (fresh.steps||[]).map(st => ({
          ...st,
          image: findStepImg(st.text) || st.image || null,
        })),
      };
      setData(d => ({...fresh, id: d.id, ...keepImages}));
      setReimportUrl("");
    } catch(e) {
      setReimportError(friendlyApiError(e));
    }
    setReimporting(false);
  };

  const doReimportFromImage = async (file) => {
    setReimporting(true); setReimportError(null);
    try {
      const base64DataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const fresh = await aiExtractRecipeFromImage(base64DataUrl);
      const oldIngMap2 = {};
      (data.ingredients||[]).forEach(ing => { if (ing.image) oldIngMap2[(ing.name||"").toLowerCase()] = ing.image; });
      const findStepImg2 = (newText) => {
        const words = (newText||"").toLowerCase().split(/\W+/).filter(w=>w.length>3);
        let best = null, bestScore = 0;
        (data.steps||[]).forEach(st => {
          if (!st.image) return;
          const score = words.filter(w=>(st.text||"").toLowerCase().includes(w)).length;
          if (score > bestScore) { bestScore = score; best = st.image; }
        });
        return bestScore >= 2 ? best : null;
      };
      const keepImages = {
        image: data.image || fresh.image,
        ingredients: (fresh.ingredients||[]).map(ing => ({
          ...ing,
          image: oldIngMap2[(ing.name||"").toLowerCase()] || ing.image || null,
        })),
        steps: (fresh.steps||[]).map(st => ({
          ...st,
          image: findStepImg2(st.text) || st.image || null,
        })),
      };
      setData(d => ({...fresh, id: d.id, ...keepImages}));
    } catch(e) {
      setReimportError(friendlyApiError(e));
    }
    setReimporting(false);
  };

  const set = (k,v) => setData(d=>({...d,[k]:v}));
  const setIng = (i,k,v) => setData(d=>{const a=[...d.ingredients];a[i]={...a[i],[k]:v};return{...d,ingredients:a};});
  const setStep = (i,k,v) => setData(d=>{const a=[...d.steps];a[i]={...a[i],[k]:v};return{...d,steps:a};});
  const addIng = () => setData(d=>({...d,ingredients:[...d.ingredients,{name:"",amount:1,unit:""}]}));
  const removeIng = i => setData(d=>({...d,ingredients:d.ingredients.filter((_,j)=>j!==i)}));
  const addStep = () => setData(d=>({...d,steps:[...d.steps,{text:"",timeMin:5,imagePrompt:""}]}));
  const removeStep = i => setData(d=>({...d,steps:d.steps.filter((_,j)=>j!==i)}));

  const uploadImg = (e, cb) => { const f=e.target.files?.[0]; if(!f) return; const r=new FileReader(); r.onload=ev=>cb(ev.target.result); r.readAsDataURL(f); };

  const checkWithAI = async () => {
    setAiChecking(true); setAiSuggestions(null);
    const ingList = (data.ingredients||[]).map(i=>`${i.amount} ${i.unit} ${i.name}`).join("\n");
    const stepList = (data.steps||[]).map((s,idx)=>`${idx+1}. ${s.text}`).join("\n");
    let sourceText = "";
    if (data.sourceUrl?.trim()) {
      setAiCheckStatus("🌐 Fetching source page…");
      const page = await fetchPageContent(data.sourceUrl.trim());
      if (page?.text) sourceText = page.text.slice(0, 12000);
    }
    setAiCheckStatus("🤖 Comparing with source…");
    try {
      const hasSource = !!sourceText;
      const raw = await anthropicCall({
        max_tokens:1500,
        system:"You are a culinary expert auditing recipes. Return ONLY valid JSON, no markdown.",
        messages:[{role:"user",content:`Recipe in app: "${data.title}" (${data.category||"dish"})

Current ingredients in app:
${ingList||"(none)"}

Current steps in app:
${stepList||"(none)"}

${hasSource
  ? `SOURCE PAGE CONTENT (the original recipe page — use this as ground truth):\n${sourceText}\n\nCompare the source page carefully against what is already in the app. List every ingredient and step that appears in the source but is MISSING or WRONG in the app version.`
  : `No source URL available. Based on the dish name and existing content, identify clearly missing items.`
}

Return JSON:
{"missingIngredients":[{"name":"","amount":1,"unit":"","reason":"from source" or "commonly needed"}],"missingSteps":[{"text":"","timeMin":5,"insertAfter":-1,"reason":""}],"notes":"brief summary"}
Use empty arrays if everything matches. Be thorough — list every discrepancy you find.`}]
      });
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) setAiSuggestions({...JSON.parse(m[0]), usedSource: !!sourceText});
    } catch(e) {
      setAiSuggestions({error: e.message === "NO_KEY" ? "No API key set — add it in ⚙️ Settings." : e.message === "INVALID_KEY" ? "Invalid API key." : "AI check failed: "+e.message});
    }
    setAiChecking(false); setAiCheckStatus("");
  };

  const acceptIngredient = ing => {
    setData(d=>({...d,ingredients:[...d.ingredients,{name:ing.name,amount:ing.amount||1,unit:ing.unit||"",image:null}]}));
    setAiSuggestions(s=>({...s,missingIngredients:(s.missingIngredients||[]).filter(i=>i.name!==ing.name)}));
  };
  const acceptStep = st => {
    setData(d=>{
      const steps=[...d.steps];
      const pos = st.insertAfter >= 0 && st.insertAfter < steps.length ? st.insertAfter+1 : steps.length;
      steps.splice(pos,0,{text:st.text,timeMin:st.timeMin||5,imagePrompt:""});
      return {...d,steps};
    });
    setAiSuggestions(s=>({...s,missingSteps:(s.missingSteps||[]).filter(i=>i.text!==st.text)}));
  };

  return (
    <div className="modal-wrap" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:1100,display:"flex",alignItems:"center",justifyContent:"center",padding:16,overflowY:"auto"}}>
      <div className="modal-inner" style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised)",borderRadius:20,maxWidth:700,width:"100%",maxHeight:"94vh",overflowY:"auto",padding:24}}>

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h2 style={{color:"var(--text)",fontFamily:"'Playfair Display',serif",margin:0}}>{t('edit.modalTitle',language)}</h2>
          <button onClick={onClose} style={{...GB,padding:"4px 10px",fontSize:18}}>×</button>
        </div>

        {/* Re-import section */}
        <div style={{marginBottom:16,background:"rgba(90,143,212,0.06)",border:"1px solid rgba(90,143,212,0.2)",borderRadius:12,padding:"12px 14px"}}>
          <div style={{color:"var(--text-sub)",fontSize:11,fontWeight:700,marginBottom:8,textTransform:"uppercase",letterSpacing:.5}}>{t('edit.reimportSection',language)}</div>
          <div style={{color:"var(--text-muted)",fontSize:12,marginBottom:10}}>{t('edit.reimportDesc',language)}</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
            <input value={reimportUrl} onChange={e=>setReimportUrl(e.target.value)}
              placeholder={t('edit.reimportUrl',language)}
              disabled={reimporting}
              onKeyDown={e=>{if(e.key==="Enter"&&reimportUrl.trim())doReimport(reimportUrl.trim());}}
              style={{...IS,flex:1,minWidth:200,height:36,padding:"0 10px",fontSize:13}}/>
            <button onClick={()=>doReimport(reimportUrl.trim())} disabled={reimporting||!reimportUrl.trim()}
              style={{...GB,padding:"8px 16px",fontSize:13,fontWeight:700,color:"#5a8fd4",border:"1px solid rgba(90,143,212,0.4)",opacity:reimporting||!reimportUrl.trim()?0.5:1,whiteSpace:"nowrap"}}>
              {reimporting?t('edit.importing',language):t('edit.reimportBtn',language)}
            </button>
            <input ref={reimportFileRef} type="file" accept="image/*" style={{display:"none"}}
              onChange={e=>{const f=e.target.files?.[0];if(f)doReimportFromImage(f);e.target.value="";}}/>
            <button onClick={()=>reimportFileRef.current?.click()} disabled={reimporting}
              style={{...GB,padding:"8px 14px",fontSize:13,fontWeight:700,color:"#5a8fd4",border:"1px solid rgba(90,143,212,0.4)",opacity:reimporting?0.5:1,whiteSpace:"nowrap"}}>
              {t('edit.fromImage',language)}
            </button>
          </div>
          {reimportError && <div style={{color:"#d45a5a",fontSize:12,marginTop:8}}>{reimportError}</div>}
          {reimporting && <div style={{color:"#5a8fd4",fontSize:12,marginTop:8,display:"flex",alignItems:"center",gap:6}}><span style={{animation:"spin 1.2s linear infinite",display:"inline-block"}}>⟳</span> {t('edit.fetchingSource',language)}</div>}
        </div>

        {/* Main image */}
        <div style={{marginBottom:16}}>
          <div style={{color:"var(--text-sub)",fontSize:11,fontWeight:700,marginBottom:8,textTransform:"uppercase"}}>{t('edit.recipePhoto',language)}</div>
          <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
            {data.image && <img src={data.image} alt="" style={{width:80,height:80,borderRadius:10,objectFit:"cover"}} onError={e=>e.target.style.display='none'}/>}
            <input ref={mainImgRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>uploadImg(e,url=>set("image",url))}/>
            <button onClick={()=>mainImgRef.current?.click()} style={{...GB,padding:"7px 14px"}}>{t('edit.uploadPhoto',language)}</button>
            <input value={imgUrlInput} onChange={e=>setImgUrlInput(e.target.value)} placeholder={t('edit.pasteImgUrl',language)}
              style={{...IS,flex:1,minWidth:150,height:34,padding:"0 10px",fontSize:12}}/>
            <button onClick={()=>{if(imgUrlInput.trim()){set("image",imgUrlInput.trim());setImgUrlInput("");}}} style={{...GB,padding:"7px 10px",fontSize:12}}>{t('edit.use',language)}</button>
          </div>
        </div>

        {/* Basic info */}
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:10,marginBottom:12}}>
          <div>
            <div style={{color:"var(--text-muted)",fontSize:10,fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>{t('edit.titleField',language)}</div>
            <input value={data.title} onChange={e=>set("title",e.target.value)} style={IS}/>
          </div>
          <div>
            <div style={{color:"var(--text-muted)",fontSize:10,fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>{t('edit.categoryField',language)}</div>
            <select value={data.category} onChange={e=>set("category",e.target.value)} style={IS}>
              {["breakfast","lunch","dessert","drink"].map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:12}}>
          {([["prepTime",'edit.prepMin'],["cookTime",'edit.cookMin'],["servings",'edit.servingsField']] as [string,string][]).map(([k,lk])=>(
            <div key={k}>
              <div style={{color:"var(--text-muted)",fontSize:10,fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>{t(lk,language)}</div>
              <input type="number" value={data[k]||""} onChange={e=>set(k,+e.target.value)} style={IS}/>
            </div>
          ))}
          <div>
            <div style={{color:"var(--text-muted)",fontSize:10,fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>{t('edit.difficultyField',language)}</div>
            <select value={data.difficulty||"beginner"} onChange={e=>set("difficulty",e.target.value)} style={IS}>
              {["beginner","intermediate","advanced"].map(d=><option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>

        {/* Spice level */}
        <div style={{marginBottom:12}}>
          <div style={{color:"var(--text-muted)",fontSize:10,fontWeight:700,marginBottom:6,textTransform:"uppercase"}}>{t('edit.spiceLevel',language)}</div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {[0,1,2,3,4,5].map(lvl=>(
              <button key={lvl} onClick={()=>set("spiceLevel",lvl)}
                style={{...GB,padding:"5px 10px",fontSize:12,background:(data.spiceLevel||0)===lvl?"var(--accent)":"var(--bg-card)",color:(data.spiceLevel||0)===lvl?"#fff":"var(--text-sub)",boxShadow:(data.spiceLevel||0)===lvl?"var(--nm-inset)":"var(--nm-raised-sm)"}}>
                {lvl===0?"⚪ "+t('label.none',language):"🌶".repeat(lvl)+" "+t(SPICE_KEYS[lvl],language)}
              </button>
            ))}
          </div>
        </div>

        {/* Cuisine */}
        <div style={{marginBottom:12}}>
          <div style={{color:"var(--text-muted)",fontSize:10,fontWeight:700,marginBottom:6,textTransform:"uppercase"}}>{t('edit.cuisine',language)}</div>
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
          <div style={{color:"var(--text-muted)",fontSize:10,fontWeight:700,marginBottom:6,textTransform:"uppercase"}}>{t('edit.nutritionPerServing',language)}</div>
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
          <div style={{color:"var(--text-muted)",fontSize:10,fontWeight:700,marginBottom:6,textTransform:"uppercase"}}>{t('edit.tagsField',language)}</div>
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
          <div style={{color:"var(--text-muted)",fontSize:10,fontWeight:700,marginBottom:6,textTransform:"uppercase"}}>{t('edit.goalsField',language)}</div>
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
            <div style={{color:"var(--text-muted)",fontSize:10,fontWeight:700,textTransform:"uppercase"}}>{t('edit.ingredients',language)}</div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>ingOverallRef.current?.click()} style={{...GB,padding:"3px 10px",fontSize:12}}>{t('edit.overallPhoto',language)}</button>
              <button onClick={addIng} style={{...GB,padding:"3px 10px",fontSize:12}}>{t('edit.addIngredient',language)}</button>
            </div>
          </div>
          <input ref={ingOverallRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>uploadImg(e,url=>set("ingredientsImage",url))}/>
          {data.ingredientsImage && (
            <div style={{position:"relative",marginBottom:10,borderRadius:10,overflow:"hidden"}}>
              <img src={data.ingredientsImage} alt="All ingredients" style={{width:"100%",height:100,objectFit:"cover"}}/>
              <div style={{position:"absolute",top:5,right:5,display:"flex",gap:4}}>
                <button onClick={()=>ingOverallRef.current?.click()} style={{background:"rgba(0,0,0,0.65)",border:"none",borderRadius:7,color:"#fff",padding:"3px 8px",fontSize:11,cursor:"pointer"}}>📷 {t('edit.change',language)}</button>
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
                <input value={ing.name} onChange={e=>setIng(i,"name",e.target.value)} placeholder={t('edit.ingPlaceholder',language)} style={{...IS,flex:2}}/>
                <input type="number" value={ing.amount||""} onChange={e=>setIng(i,"amount",+e.target.value)} placeholder={t('edit.qtyPlaceholder',language)} style={{...IS,flex:1,minWidth:50}}/>
                <input value={ing.unit} onChange={e=>setIng(i,"unit",e.target.value)} placeholder={t('edit.unitPlaceholder',language)} style={{...IS,flex:1,minWidth:50}}/>
                <select value={ing.section||inferIngSection(ing.name)} onChange={e=>setIng(i,"section",e.target.value)}
                  style={{...IS,flex:"0 0 auto",width:"auto",padding:"0 6px",fontSize:11,height:36,color:(ING_SECTIONS.find(s=>s.key===(ing.section||inferIngSection(ing.name)))?.color||"var(--text-sub)")}}>
                  {ING_SECTIONS.map(s=><option key={s.key} value={s.key}>{getSectionLabel(s.key, language)}</option>)}
                </select>
                <button onClick={()=>removeIng(i)} style={{...GB,padding:"4px 8px",color:"#f08080",fontSize:14,flexShrink:0}}>×</button>
              </div>
            </div>
          ))}
        </div>

        {/* Steps */}
        <div style={{marginBottom:18}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div style={{color:"var(--text-muted)",fontSize:10,fontWeight:700,textTransform:"uppercase"}}>{t('edit.steps',language)}</div>
            <button onClick={addStep} style={{...GB,padding:"3px 10px",fontSize:12}}>{t('edit.addStep',language)}</button>
          </div>
          {(data.steps||[]).map((step,i)=>(
            <div key={i} style={{background:"var(--nm-input-bg)",boxShadow:"var(--nm-inset)",borderRadius:12,padding:12,marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <span style={{color:"var(--accent)",fontWeight:700,fontSize:13}}>{t('edit.stepLabel',language,{n:String(i+1)})}</span>
                <button onClick={()=>removeStep(i)} style={{...GB,padding:"2px 8px",color:"#f08080",fontSize:13}}>{t('edit.removeStep',language)}</button>
              </div>
              <textarea value={step.text} onChange={e=>setStep(i,"text",e.target.value)} placeholder={t('edit.stepPlaceholder',language)}
                style={{...IS,minHeight:60,resize:"vertical",marginBottom:8}}/>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{color:"var(--text-muted)",fontSize:11}}>⏱</span>
                  <input type="number" value={step.timeMin||""} onChange={e=>setStep(i,"timeMin",+e.target.value)} placeholder={t('edit.minPlaceholder',language)}
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
                  <button onClick={()=>stepImgRefs.current[i]?.click()} style={{...GB,padding:"4px 10px",fontSize:11}}>📷 {getStepImages(step).length>0?t('edit.addMorePhotos',language):t('edit.addPhoto',language)}</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* AI Completeness Check */}
        <div style={{marginBottom:18,background:"var(--nm-input-bg)",boxShadow:"var(--nm-inset)",borderRadius:14,padding:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:aiSuggestions?12:0}}>
            <div>
              <span style={{color:"var(--text-sub)",fontSize:12,fontWeight:700}}>{t('edit.aiCheckTitle',language)}</span>
              <div style={{color:"var(--text-muted)",fontSize:11,marginTop:2}}>
                {aiChecking ? aiCheckStatus : data.sourceUrl ? t('edit.aiWillCompare',language) : t('edit.aiCulinary',language)}
              </div>
            </div>
            <button onClick={checkWithAI} disabled={aiChecking}
              style={{...GB,padding:"5px 12px",fontSize:12,background:aiChecking?"var(--nm-input-bg)":"linear-gradient(135deg,var(--accent2),var(--accent))",color:aiChecking?"var(--text-muted)":"#fff",border:"none",flexShrink:0}}>
              {aiChecking?t('edit.checking',language):t('edit.checkNow',language)}
            </button>
          </div>
          {aiSuggestions && (
            <div>
              {aiSuggestions.usedSource && <div style={{color:"#5a8fd4",fontSize:11,marginBottom:8}}>{t('edit.aiUsedSource',language)}</div>}
              {aiSuggestions.error && <div style={{color:"#f08080",fontSize:12}}>{aiSuggestions.error}</div>}
              {aiSuggestions.notes && <div style={{color:"var(--text-sub)",fontSize:12,marginBottom:10,padding:"6px 10px",background:"rgba(90,173,142,0.08)",borderRadius:8}}>{aiSuggestions.notes}</div>}
              {(aiSuggestions.missingIngredients||[]).length > 0 && (
                <div style={{marginBottom:10}}>
                  <div style={{color:"#ffd580",fontSize:11,fontWeight:700,marginBottom:6}}>{t('edit.aiMissingIng',language)}</div>
                  {(aiSuggestions.missingIngredients||[]).map((ing,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",borderRadius:8,background:"rgba(255,213,128,0.08)",marginBottom:4,border:"1px solid rgba(255,213,128,0.2)"}}>
                      <div style={{flex:1}}>
                        <span style={{color:"var(--text)",fontSize:13,fontWeight:600}}>{ing.amount} {ing.unit} {ing.name}</span>
                        <span style={{color:"var(--text-muted)",fontSize:11,marginLeft:8}}>{ing.reason}</span>
                      </div>
                      <button onClick={()=>acceptIngredient(ing)} style={{...GB,padding:"3px 10px",fontSize:12,color:"#5aad8e",background:"rgba(90,173,142,0.15)",border:"1px solid rgba(90,173,142,0.3)"}}>{t('edit.addBtn',language)}</button>
                    </div>
                  ))}
                </div>
              )}
              {(aiSuggestions.missingSteps||[]).length > 0 && (
                <div>
                  <div style={{color:"#5a8fd4",fontSize:11,fontWeight:700,marginBottom:6}}>{t('edit.aiMissingSteps',language)}</div>
                  {(aiSuggestions.missingSteps||[]).map((st,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"6px 8px",borderRadius:8,background:"rgba(90,143,212,0.08)",marginBottom:4,border:"1px solid rgba(90,143,212,0.2)"}}>
                      <div style={{flex:1}}>
                        <span style={{color:"var(--text)",fontSize:13}}>{st.text}</span>
                        {st.timeMin > 0 && <span style={{color:"var(--text-muted)",fontSize:11,marginLeft:6}}>⏱ {st.timeMin}m</span>}
                        <div style={{color:"var(--text-muted)",fontSize:11,marginTop:2}}>{st.reason}</div>
                      </div>
                      <button onClick={()=>acceptStep(st)} style={{...GB,padding:"3px 10px",fontSize:12,color:"#5a8fd4",background:"rgba(90,143,212,0.15)",border:"1px solid rgba(90,143,212,0.3)",flexShrink:0}}>{t('edit.addBtn',language)}</button>
                    </div>
                  ))}
                </div>
              )}
              {!aiSuggestions.error && (aiSuggestions.missingIngredients||[]).length===0 && (aiSuggestions.missingSteps||[]).length===0 && (
                <div style={{color:"#5aad8e",fontSize:12,textAlign:"center",padding:"6px 0"}}>{t('edit.aiComplete',language)}</div>
              )}
            </div>
          )}
        </div>

        {/* Delete confirmation */}
        {confirmDelete && (
          <div style={{marginBottom:12,background:"rgba(212,90,90,0.1)",border:"1px solid rgba(212,90,90,0.35)",borderRadius:12,padding:"12px 14px"}}>
            <div style={{color:"#d45a5a",fontWeight:700,fontSize:13,marginBottom:10}}>{t('edit.deleteConfirmMsg',language,{title:data.title})}</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setConfirmDelete(false)} style={{...GB,flex:1}}>{t('edit.keepIt',language)}</button>
              <button onClick={()=>onDelete(data.id)}
                style={{flex:1,background:"linear-gradient(135deg,#a03030,#d45a5a)",border:"none",borderRadius:12,color:"#fff",padding:"10px 0",fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>
                {t('edit.deleteForever',language)}
              </button>
            </div>
          </div>
        )}

        <div style={{display:"flex",gap:10}}>
          {onDelete && !confirmDelete && (
            <button onClick={()=>setConfirmDelete(true)}
              style={{...GB,flex:"0 0 auto",padding:"0 14px",color:"#d45a5a",border:"1px solid rgba(212,90,90,0.35)"}}>
              {t('edit.deleteBtn',language)}
            </button>
          )}
          <button onClick={onClose} style={{...GB,flex:1}}>{t('edit.cancel',language)}</button>
          <button onClick={()=>onSave({...data,totalTime:(data.prepTime||0)+(data.cookTime||0)})}
            style={{flex:2,background:"linear-gradient(135deg,var(--accent2),var(--accent))",border:"none",borderRadius:12,color:"#fff",padding:14,fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>
            {t('edit.saveChanges',language)}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ADD RECIPE MODAL ─────────────────────────────────────────────────────────
function SmartAddModal({onClose, onAdd, initialUrl="", language='en'}) {
  const [phase, setPhase] = useState("input");
  const [loadingMsg, setLoadingMsg] = useState("Extracting your recipe...");
  const [inputVal, setInputVal] = useState(initialUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [imgUrlInput, setImgUrlInput] = useState("");
  const [verifyStatus, setVerifyStatus] = useState(null); // null|'checking'|{missingIngredients,missingSteps}
  const fileRef = useRef(null);
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  const verifyCompleteness = async (recipe, pageText) => {
    if (!pageText) return;
    setVerifyStatus('checking');
    const ingList = (recipe.ingredients||[]).map(i=>`${i.amount} ${i.unit} ${i.name}`).join("\n");
    const stepList = (recipe.steps||[]).map((s,idx)=>`${idx+1}. ${s.text}`).join("\n");
    try {
      const raw = await anthropicCall({
        max_tokens:1500,
        system:"You are auditing an extracted recipe for completeness and accuracy. Return ONLY valid JSON, no markdown.",
        messages:[{role:"user",content:`A recipe was extracted from a webpage. Audit it for missing AND wrong/substituted ingredients.

EXTRACTED ingredients:
${ingList||"(none)"}

EXTRACTED steps:
${stepList||"(none)"}

SOURCE PAGE (ground truth — the real recipe):
${pageText.slice(0,14000)}

1. List every ingredient that appears in the SOURCE but is MISSING from the extracted version (include all sections: toppings, garnishes, optionals, every section header).
2. List every ingredient in the EXTRACTED version that does NOT match the source (wrong name, wrong amount, substituted) — add it to missingIngredients with reason "substituted: source says X".
3. List every step that appears in the source but is missing from the extracted version.

Return JSON: {"missingIngredients":[{"name":"","amount":1,"unit":"","reason":""}],"missingSteps":[{"text":"","timeMin":5,"insertAfter":-1,"reason":""}]}
Return empty arrays if nothing is missing or wrong.`}]
      });
      const m = raw.match(/\{[\s\S]*\}/);
      const result = m ? JSON.parse(m[0]) : {missingIngredients:[],missingSteps:[]};
      // Auto-apply all missing items immediately — no click required
      const missing = result.missingIngredients || [];
      const missingSteps = result.missingSteps || [];
      if (missing.length > 0 || missingSteps.length > 0) {
        setData(d => {
          const newIngs = missing.map(ing=>({name:ing.name,amount:ing.amount||1,unit:ing.unit||"",image:null,section:ing.section||"main"}));
          const steps = [...d.steps];
          [...missingSteps].reverse().forEach(st => {
            const pos = st.insertAfter>=0 && st.insertAfter<steps.length ? st.insertAfter+1 : steps.length;
            steps.splice(pos, 0, {text:st.text, timeMin:st.timeMin||5, imagePrompt:""});
          });
          return {...d, ingredients:[...d.ingredients, ...newIngs], steps};
        });
      }
      setVerifyStatus({...result, autoAdded: missing.length + missingSteps.length});
    } catch(e) {
      setVerifyStatus({missingIngredients:[],missingSteps:[],error:e.message});
    }
  };

  const handleError = (e) => friendlyApiError(e);

  const run = async () => {
    if (!inputVal.trim()) return;
    setLoading(true); setError(null); setPhase("loading"); setVerifyStatus(null);
    setLoadingMsg("Fetching page & extracting recipe…");
    try {
      const result = await aiExtractRecipe(inputVal.trim());
      const pageText = result._pageText;
      delete result._pageText; // don't persist this field
      if (!result.image) result.image = makeFoodSVG(result.title, result.category);
      const recipe = {...result, id:Date.now()};
      setData(recipe);
      setPhase("review");
      // Fire completeness check in background using the already-fetched page text
      if (pageText) verifyCompleteness(recipe, pageText);
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
          <h2 style={{color:"#fff",fontFamily:"'Playfair Display',serif",margin:0}}>{t('add.title',language)}</h2>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#6a7a90",cursor:"pointer",fontSize:22}}>×</button>
        </div>

        {phase==="input" && (
          <div>
            {/* Camera / Image scan */}
            <div style={{border:"1px dashed rgba(90,173,142,0.4)",borderRadius:14,padding:"20px 16px",marginBottom:20,textAlign:"center",background:"rgba(90,173,142,0.04)"}}>
              <div style={{fontSize:36,marginBottom:6}}>📷</div>
              <div style={{color:"var(--text-sub)",fontSize:13,fontWeight:600,marginBottom:6}}>{t('add.scanTitle',language)}</div>
              <div style={{color:"var(--text-muted)",fontSize:12,marginBottom:14}}>{t('add.scanDesc',language)}</div>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{display:"none"}}
                onChange={e=>{const f=e.target.files?.[0];if(f) runFromImage(f); e.target.value="";}}/>
              <input ref={galleryRef} type="file" accept="image/*" style={{display:"none"}}
                onChange={e=>{const f=e.target.files?.[0];if(f) runFromImage(f); e.target.value="";}}/>
              <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
                <button onClick={()=>cameraRef.current?.click()}
                  style={{...GB,padding:"10px 20px",fontSize:13,fontWeight:700,color:"#5aad8e",border:"1px solid rgba(90,173,142,0.35)"}}>
                  {t('add.takePhoto',language)}
                </button>
                <button onClick={()=>galleryRef.current?.click()}
                  style={{...GB,padding:"10px 20px",fontSize:13,fontWeight:700}}>
                  {t('add.uploadImage',language)}
                </button>
              </div>
            </div>

            {/* Divider */}
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
              <div style={{flex:1,height:1,background:"var(--border)"}}/>
              <span style={{color:"var(--text-muted)",fontSize:12,flexShrink:0}}>{t('add.orPaste',language)}</span>
              <div style={{flex:1,height:1,background:"var(--border)"}}/>
            </div>

            {error && <div style={{background:"rgba(192,80,80,0.15)",border:"1px solid rgba(192,80,80,0.3)",borderRadius:10,padding:"10px 14px",color:"#f08080",fontSize:13,marginBottom:14}}>{error}</div>}
            <textarea value={inputVal} onChange={e=>setInputVal(e.target.value)}
              style={{...IS,minHeight:90,resize:"vertical",marginBottom:14}}
              placeholder={t('add.urlPlaceholder',language)}/>
            <button onClick={run} style={{width:"100%",background:"linear-gradient(135deg,#3a7d5e,#5aad8e)",border:"none",borderRadius:12,color:"#fff",padding:14,fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>
              {t('add.extractBtn',language)}
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
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:"#5aad8e",fontSize:11,fontWeight:700,marginBottom:4}}>{t('add.extracted',language)}</div>
                <div style={{color:"#fff",fontWeight:700,fontFamily:"'Playfair Display',serif",fontSize:16}}>{data.title}</div>
                <NutriBadge n={data.nutrition}/>
                <div style={{color:"#6a7a90",fontSize:11,marginTop:4}}>{(data.ingredients||[]).length} ingredients · {(data.steps||[]).length} steps</div>
              </div>
            </div>

            {/* Completeness verification banner */}
            {verifyStatus==='checking' && (
              <div style={{background:"rgba(90,143,212,0.1)",border:"1px solid rgba(90,143,212,0.25)",borderRadius:12,padding:"10px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:16,animation:"spin 1.5s linear infinite",display:"inline-block"}}>🔍</span>
                <div style={{color:"#5a8fd4",fontSize:13,fontWeight:600}}>{t('add.verifying',language)}</div>
              </div>
            )}
            {verifyStatus && verifyStatus!=='checking' && (() => {
              const {autoAdded=0, error} = verifyStatus;
              if (error) return (
                <div style={{background:"rgba(212,90,90,0.08)",border:"1px solid rgba(212,90,90,0.25)",borderRadius:12,padding:"10px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:10}}>
                  <span>⚠️</span>
                  <div style={{color:"#d45a5a",fontSize:13}}>Verification error: {error}</div>
                </div>
              );
              if (autoAdded > 0) return (
                <div style={{background:"rgba(90,143,212,0.1)",border:"1px solid rgba(90,143,212,0.3)",borderRadius:12,padding:"10px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:10}}>
                  <span>✅</span>
                  <div style={{color:"#5a8fd4",fontSize:13,fontWeight:600}}>{autoAdded} missing item{autoAdded!==1?"s":""} found & automatically added from source page</div>
                </div>
              );
              return (
                <div style={{background:"rgba(90,173,142,0.1)",border:"1px solid rgba(90,173,142,0.25)",borderRadius:12,padding:"10px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:10}}>
                  <span>✅</span>
                  <div style={{color:"#5aad8e",fontSize:13,fontWeight:600}}>{t('add.allVerified',language)}</div>
                </div>
              );
            })()}

            {/* Image upload */}
            <div style={{marginBottom:14,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,padding:"12px 14px"}}>
              <div style={{color:"#6a7a90",fontSize:10,fontWeight:700,marginBottom:8,textTransform:"uppercase"}}>{t('add.recipeImage',language)}</div>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                {data.image && <img src={data.image} alt="" style={{width:56,height:56,borderRadius:8,objectFit:"cover",flexShrink:0}} onError={e=>e.target.style.display='none'}/>}
                <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}}
                  onChange={e=>{const f=e.target.files?.[0];if(f){const r=new FileReader();r.onload=ev=>setData(d=>({...d,image:ev.target.result}));r.readAsDataURL(f);}}}/>
                <button onClick={()=>fileRef.current?.click()} style={{...GB,padding:"6px 12px",fontSize:12}}>{t('add.uploadPhoto',language)}</button>
                <input value={imgUrlInput} onChange={e=>setImgUrlInput(e.target.value)}
                  placeholder={t('add.pasteImgUrl',language)}
                  style={{...IS,flex:1,minWidth:160,height:34,padding:"0 10px",fontSize:12}}/>
                <button onClick={()=>{if(imgUrlInput.trim()){setData(d=>({...d,image:imgUrlInput.trim()}));setImgUrlInput("");}}}
                  style={{...GB,padding:"6px 10px",fontSize:12}}>{t('edit.use',language)}</button>
              </div>
            </div>

            {/* Editable fields */}
            <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:10,marginBottom:12}}>
              <div>
                <div style={{color:"#6a7a90",fontSize:10,fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>{t('add.titleField',language)}</div>
                <input value={data.title} onChange={e=>set("title",e.target.value)} style={IS}/>
              </div>
              <div>
                <div style={{color:"#6a7a90",fontSize:10,fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>{t('add.categoryField',language)}</div>
                <select value={data.category} onChange={e=>set("category",e.target.value)} style={IS}>
                  {["breakfast","lunch","dessert","drink"].map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
              {([["prepTime",'edit.prepMin'],["cookTime",'edit.cookMin'],["servings",'edit.servingsField']] as [string,string][]).map(([k,lk])=>(
                <div key={k}>
                  <div style={{color:"#6a7a90",fontSize:10,fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>{t(lk,language)}</div>
                  <input type="number" value={data[k]||""} onChange={e=>set(k,+e.target.value)} style={IS}/>
                </div>
              ))}
            </div>

            <div style={{marginBottom:12}}>
              <div style={{color:"#6a7a90",fontSize:10,fontWeight:700,marginBottom:6,textTransform:"uppercase"}}>{t('add.tagsField',language)}</div>
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
              <button onClick={()=>{setPhase("input");setData(null);}} style={{...GB,flex:1}}>{t('add.tryAgain',language)}</button>
              <button onClick={save} style={{flex:2,background:"linear-gradient(135deg,#3a7d5e,#5aad8e)",border:"none",borderRadius:12,color:"#fff",padding:14,fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>
                {t('add.saveRecipe',language)}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MIX & MATCH ─────────────────────────────────────────────────────────────
function MixMatch({recipes, onAddToMealPlan, onSaveAsRecipe, language='en'}) {
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
      <div style={{color:"var(--text-sub)",fontSize:10,fontWeight:700,letterSpacing:1,marginBottom:8,textTransform:"uppercase"}}>{label}</div>
      {!options.length
        ? <div style={{color:"var(--text-muted)",fontSize:12,padding:12,background:"var(--nm-input-bg)",borderRadius:10,textAlign:"center",border:"1px dashed var(--border)"}}>{fallback}</div>
        : options.map(r=>(
          <button key={r.id} onClick={()=>setSel(s=>({...s,[key2]:(s[key2]&&s[key2].id===r.id)?null:r}))}
            style={{width:"100%",background:(sel[key2]&&sel[key2].id===r.id)?"rgba(58,125,94,0.2)":"var(--nm-input-bg)",border:"1px solid "+((sel[key2]&&sel[key2].id===r.id)?"#3a7d5e":"var(--border)"),borderRadius:10,padding:"8px 10px",cursor:"pointer",display:"flex",alignItems:"center",gap:9,marginBottom:5,fontFamily:"inherit"}}>
            <SmartImage recipe={r} style={{width:36,height:36,borderRadius:7,flexShrink:0}}/>
            <div style={{textAlign:"left",flex:1,minWidth:0}}>
              <div style={{color:"var(--text)",fontSize:12,fontWeight:600,lineHeight:1.3}}>{r.title}</div>
              <div style={{color:"var(--text-muted)",fontSize:11}}>{r.nutrition.calories}kcal · {r.totalTime||(r.prepTime||0)+(r.cookTime||0)}min</div>
            </div>
            {sel[key2]&&sel[key2].id===r.id&&<span style={{color:"#5aad8e"}}>✓</span>}
          </button>
        ))
      }
    </div>
  );

  return (
    <div>
      <h2 style={{color:"var(--text)",fontFamily:"'Playfair Display',serif",marginBottom:4}}>{t('mix.title',language)}</h2>
      <p style={{color:"var(--text-sub)",fontSize:13,marginBottom:18}}>{t('mix.subtitle',language)}</p>

      <div style={{background:"var(--nm-input-bg)",border:"1px solid var(--border)",borderRadius:14,padding:"14px 18px",marginBottom:18,display:"flex",gap:24,flexWrap:"wrap",alignItems:"center"}}>
        {[[t('mix.portionsPerPerson',language),portions,setPortions,1,10],[t('mix.mealsPerDay',language),mealsPerDay,setMealsPerDay,1,6]].map(([lbl,val,fn,mn,mx])=>(
          <div key={lbl} style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{color:"var(--text-sub)",fontSize:13,whiteSpace:"nowrap"}}>{lbl}</span>
            <button onClick={()=>fn(v=>Math.max(mn,v-1))} style={{...GB,padding:"3px 11px"}}>−</button>
            <span style={{color:"var(--text)",fontWeight:700,fontSize:20,minWidth:24,textAlign:"center"}}>{val}</span>
            <button onClick={()=>fn(v=>Math.min(mx,v+1))} style={{...GB,padding:"3px 11px"}}>+</button>
          </div>
        ))}
      </div>

      <div style={{display:"flex",gap:14,marginBottom:20,flexWrap:"wrap"}}>
        <Slot label={t('mix.protein',language)} key2="protein" options={proteins.length?proteins:recipes.slice(0,4)} fallback={t('mix.noProtein',language)}/>
        <Slot label={t('mix.grain',language)} key2="grain" options={grains.length?grains:recipes.slice(0,4)} fallback={t('mix.noGrain',language)}/>
        <Slot label={t('mix.side',language)} key2="side" options={sides.length?sides:recipes.slice(0,4)} fallback={t('mix.noSide',language)}/>
      </div>

      {combined.length>0 && (
        <div style={{background:"linear-gradient(135deg,rgba(58,125,94,0.1),rgba(90,143,212,0.06))",border:"1px solid rgba(58,125,94,0.28)",borderRadius:16,padding:20}}>
          <div style={{color:"#5aad8e",fontWeight:700,fontSize:11,marginBottom:10,letterSpacing:.8}}>✨ COMBO · {portions} portion{portions!==1?"s":""}/person · {mealsPerDay}x/day · <span style={{color:"#c8a8ff"}}>{portions*mealsPerDay} total serving{portions*mealsPerDay!==1?"s":""}/day</span></div>
          <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:14}}>
            {combined.map(r=><span key={r.id} style={{background:"rgba(58,125,94,0.2)",color:"#5aad8e",border:"1px solid rgba(58,125,94,0.38)",borderRadius:20,padding:"4px 12px",fontSize:13,fontWeight:600}}>{r.title}</span>)}
          </div>
          <div style={{marginBottom:10}}>
            <div style={{color:"var(--text-sub)",fontSize:11,fontWeight:700,marginBottom:5}}>{t('mix.perServing',language,{n:String(portions)})}</div>
            <NutriBadge n={totN}/>
          </div>
          {mealsPerDay>1 && <div style={{marginBottom:12}}>
            <div style={{color:"var(--text-sub)",fontSize:11,fontWeight:700,marginBottom:5}}>{t('mix.dailyTotal',language,{n:String(mealsPerDay)})}</div>
            <NutriBadge n={dailyN}/>
          </div>}
          {totTime>0 && <div style={{color:"#5a8fd4",fontSize:12,marginBottom:14}}>⏱ ~{totTime}min cook time</div>}
          {allAllergens.length>0 && <div style={{color:"#f08080",fontSize:12,marginBottom:14}}>⚠ {allAllergens.join(", ")}</div>}
          <div style={{display:"flex",gap:9,flexWrap:"wrap"}}>
            <input value={comboName} onChange={e=>setComboName(e.target.value)} placeholder={t('mix.namePlaceholder',language)}
              style={{...IS,flex:1,minWidth:160,fontSize:13,padding:"8px 12px"}}/>
            <button onClick={handleSave} style={{background:saved?"rgba(58,125,94,0.55)":"linear-gradient(135deg,#3a7d5e,#5aad8e)",border:"none",borderRadius:11,color:"#fff",padding:"10px 16px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
              {saved?t('mix.saved',language):t('mix.addToPlan',language)}
            </button>
            {onSaveAsRecipe && <button onClick={handleSaveAsRecipe} style={{...GB,whiteSpace:"nowrap"}}>{t('mix.saveRecipe',language)}</button>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MEAL PREP OPTIMIZER ─────────────────────────────────────────────────────
function MealPrepOptimizer({recipes, onAddToMealPlan, language='en'}) {
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

  const PREP_TIPS = [t('opt.tip1',language), t('opt.tip2',language), t('opt.tip3',language)];

  return (
    <div>
      <h2 style={{color:"var(--text)",fontFamily:"'Playfair Display',serif",marginBottom:6}}>{t('opt.title',language)}</h2>
      <p style={{color:"var(--text-sub)",fontSize:13,marginBottom:20}}>{t('opt.subtitle',language)}</p>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:10,marginBottom:20}}>
        {recipes.map(r=>(
          <button key={r.id} onClick={()=>toggle(r.id)}
            style={{background:selected.includes(r.id)?"rgba(58,125,94,0.2)":"var(--nm-input-bg)",border:"1px solid "+(selected.includes(r.id)?"#3a7d5e":"var(--border)"),borderRadius:12,padding:"10px 14px",cursor:"pointer",textAlign:"left",fontFamily:"inherit",display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:18}}>{selected.includes(r.id)?"✅":"⬜"}</span>
            <div>
              <div style={{color:"var(--text)",fontWeight:600,fontSize:13}}>{r.title}</div>
              <div style={{color:"var(--text-muted)",fontSize:11,marginTop:2}}>{r.totalTime||((r.prepTime||0)+(r.cookTime||0))}min</div>
            </div>
          </button>
        ))}
      </div>

      <button onClick={optimize} disabled={selected.length<2||loading}
        style={{background:selected.length>=2&&!loading?"linear-gradient(135deg,#5a8fd4,#3a5fa0)":"var(--nm-input-bg)",border:"none",borderRadius:12,color:selected.length>=2&&!loading?"#fff":"var(--text-muted)",padding:"12px 24px",fontWeight:700,fontSize:14,cursor:selected.length>=2&&!loading?"pointer":"not-allowed",fontFamily:"inherit",marginBottom:20}}>
        {loading?t('opt.optimizing',language):t('opt.optimizeBtn',language)}
      </button>

      {result && (
        <div style={{background:"rgba(90,143,212,0.07)",border:"1px solid rgba(90,143,212,0.2)",borderRadius:14,padding:18,marginBottom:20}}>
          <div style={{color:"#5a8fd4",fontWeight:700,fontSize:13,marginBottom:12}}>{t('opt.workflow',language)}</div>
          {result.split("\n").filter(l=>l.trim()).map((line,i)=>{
            const isParallel = line.includes("[PARALLEL]");
            return (
              <div key={i} style={{display:"flex",gap:10,marginBottom:8,alignItems:"flex-start"}}>
                <div style={{color:"var(--text)",fontSize:13,lineHeight:1.5,flex:1,background:isParallel?"rgba(90,143,212,0.12)":"transparent",borderRadius:isParallel?7:0,padding:isParallel?"4px 8px":"0",border:isParallel?"1px solid rgba(90,143,212,0.3)":"none"}}>
                  {line}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{background:"rgba(90,173,142,0.07)",border:"1px solid rgba(90,173,142,0.2)",borderRadius:14,padding:18}}>
        <div style={{color:"#5aad8e",fontWeight:700,fontSize:13,marginBottom:10}}>{t('opt.prepTips',language)}</div>
        {PREP_TIPS.map((tip,i)=>(
          <div key={i} style={{display:"flex",gap:10,marginBottom:8,alignItems:"flex-start"}}>
            <span style={{color:"#5aad8e",flexShrink:0}}>•</span>
            <div style={{color:"var(--text-sub)",fontSize:13,lineHeight:1.5}}>{tip}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SHOPPING LIST ───────────────────────────────────────────────────────────
function ShoppingList({mealPlanItems, recipes, spends, onLogSpend, weeklyBudget, pantry=[], language='en', translatedRecipes={}}) {
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

  // Build list live from mealPlanItems, using translated ingredient names when available
  const autoList = useMemo(() => {
    const m = {};
    mealPlanItems.forEach(item=>{
      const recs = item.type==="combo" ? (item.recipes||[]) : [item.recipe].filter(Boolean);
      const scale = (item.portions||1) * people * weeks;
      recs.forEach(r=>{
        const tr = (r?.id && translatedRecipes[r.id]) ? translatedRecipes[r.id] : r;
        (tr.ingredients||[]).forEach(ing=>{
          const k = ing.name.toLowerCase();
          if (m[k]) m[k].amount += (ing.amount||0)*scale;
          else m[k] = {name:ing.name, amount:(ing.amount||0)*scale, unit:ing.unit||"", section:getSection(ing.name)};
        });
      });
    });
    return Object.values(m).sort((a,b)=>a.name.localeCompare(b.name));
  }, [mealPlanItems, people, weeks, translatedRecipes]);

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
    onLogSpend?.({id:Date.now(), amount:amt, note:spendNote.trim()||t('shopping.tripDefault',language), date:new Date().toISOString()});
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
        {(() => { const pi=pantry.find(p=>p.name.toLowerCase()===item.name.toLowerCase()); return pi ? <span style={{color:"#5aad8e",fontSize:11,fontWeight:700,flexShrink:0}}>🥫 {pi.amount}{pi.unit}</span> : null; })()}
        {item.amount>0 && <span style={{color:"var(--accent)",fontWeight:600,fontSize:12}}>{Math.ceil(item.amount*10)/10} {item.unit}</span>}
        {item.manual && <button onClick={e=>{e.stopPropagation();removeManual(item.id);}} style={{background:"none",border:"none",color:"#f08080",fontSize:14,cursor:"pointer",padding:"0 2px"}}>×</button>}
      </div>
    );
  });

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18,flexWrap:"wrap",gap:10}}>
        <div>
          <h2 style={{color:"var(--text)",fontFamily:"'Playfair Display',serif",margin:"0 0 4px"}}>🛒 {t('shopping.title',language)}</h2>
          <p style={{color:"var(--text-sub)",fontSize:13,margin:0}}>{unchecked.length} {t('shopping.subtitle',language).replace('{count}',unchecked.length).split(' ').slice(1).join(' ')}</p>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={()=>setBySection(s=>!s)} style={{...GB,fontSize:12}}>{bySection?("📋 "+t('shopping.allItems',language)):("🏪 "+t('shopping.bySection',language))}</button>
          {checkedItems.length>0&&<button onClick={clearChecked} style={{...GB,fontSize:12,color:"#f08080"}}>{t('shopping.uncheckAll',language)}</button>}
          <button onClick={exportList} style={{...GB,fontSize:12}}>{t('shopping.export',language)}</button>
        </div>
      </div>

      {/* Settings row */}
      <div style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised)",borderRadius:14,padding:"12px 16px",marginBottom:18,display:"flex",gap:16,flexWrap:"wrap",alignItems:"center"}}>
        {[["👥 "+t('shopping.people',language),people,setPeople,1,20],["📅 "+t('shopping.weeks',language),weeks,setWeeks,1,8]].map(([lbl,val,fn,mn,mx])=>(
          <div key={lbl} style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{color:"var(--text-sub)",fontSize:13}}>{lbl}</span>
            <button onClick={()=>fn(v=>Math.max(mn,v-1))} style={{...GB,padding:"4px 10px"}}>−</button>
            <span style={{color:"var(--text)",fontWeight:700,minWidth:20,textAlign:"center"}}>{val}</span>
            <button onClick={()=>fn(v=>Math.min(mx,v+1))} style={{...GB,padding:"4px 10px"}}>+</button>
          </div>
        ))}
        <div style={{color:"var(--text-muted)",fontSize:12,marginLeft:"auto"}}>
          {t('shopping.mealsAutoUpdate',language,{n:String(mealPlanItems.length)})}
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
              <div style={{color:"var(--text)",fontWeight:700,fontSize:13}}>{t('shopping.estimatedCost',language)}</div>
              <div style={{color:"var(--text-muted)",fontSize:11}}>{t('shopping.basedOn',language,{n:String(autoList.length)})}</div>
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
          <div style={{fontSize:14,marginBottom:6}}>{t('shopping.noItems',language)}</div>
          <div style={{fontSize:12}}>{t('planner.noMealsHint',language)}</div>
        </div>
      )}

      {/* Manual add */}
      <div style={{display:"flex",gap:8,marginBottom:18}}>
        <input value={newItem} onChange={e=>setNewItem(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addManual()}
          placeholder={t('shopping.addManual',language)} style={{...IS,flex:1,height:38,padding:"0 12px"}}/>
        <button onClick={addManual} style={{...GB,padding:"8px 16px",background:"var(--accent)",color:"#fff",fontWeight:700}}>+ Add</button>
      </div>

      {/* List */}
      {allItems.length>0 && (bySection ? (
        SECTIONS.map(sec=>{
          const items = allItems.filter(x=>x.section===sec.key);
          if (!items.length) return null;
          return (
            <div key={sec.key} style={{marginBottom:18}}>
              <div style={{color:sec.color,fontWeight:700,fontSize:12,letterSpacing:.8,textTransform:"uppercase",marginBottom:8,paddingLeft:4}}>{t('shopping.'+sec.key,language)||sec.label}</div>
              {renderItems(items)}
            </div>
          );
        })
      ) : renderItems(allItems))}

      {checkedItems.length>0 && (
        <div style={{marginTop:16,opacity:.6}}>
          <div style={{color:"var(--text-muted)",fontSize:11,fontWeight:700,letterSpacing:.8,textTransform:"uppercase",marginBottom:8}}>{t('shopping.inCart',language)}</div>
          {renderItems(checkedItems)}
        </div>
      )}

      {/* Spend Logger */}
      <div style={{marginTop:24,background:"var(--bg-card)",boxShadow:"var(--nm-raised)",borderRadius:14,padding:"14px 16px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:showSpendLog?12:0}}>
          <div style={{color:"var(--text)",fontWeight:700,fontSize:13}}>{t('shopping.logSpend',language)}</div>
          <button onClick={()=>setShowSpendLog(s=>!s)} style={{...GB,fontSize:12,padding:"4px 10px"}}>{showSpendLog?t('edit.cancel',language):t('shopping.add',language)}</button>
        </div>
        {showSpendLog && (
          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
            <div style={{flex:"0 0 110px"}}>
              <div style={{color:"var(--text-muted)",fontSize:10,marginBottom:4}}>{t('shopping.amount',language)}</div>
              <input type="number" value={spendInput} onChange={e=>setSpendInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&logSpend()}
                placeholder="0.00" style={{...IS,height:34,padding:"0 10px",fontSize:14}}/>
            </div>
            <div style={{flex:1,minWidth:120}}>
              <div style={{color:"var(--text-muted)",fontSize:10,marginBottom:4}}>{t('shopping.note',language)}</div>
              <input value={spendNote} onChange={e=>setSpendNote(e.target.value)} onKeyDown={e=>e.key==="Enter"&&logSpend()}
                placeholder={t('shopping.notePlaceholder',language)} style={{...IS,height:34,padding:"0 10px",fontSize:13}}/>
            </div>
            <button onClick={logSpend} style={{...GB,padding:"8px 14px",background:"var(--accent)",color:"#fff",fontWeight:700,fontSize:13}}>{t('shopping.save',language)}</button>
          </div>
        )}
        {(spends||[]).length>0 && (
          <div style={{marginTop:showSpendLog?12:0}}>
            <div style={{color:"var(--text-muted)",fontSize:10,fontWeight:700,marginBottom:6,textTransform:"uppercase"}}>{t('shopping.recent',language)}</div>
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
function MealPlanManager({recipes, mealPlanItems, setMealPlanItems, onGoShopping, language='en', translatedRecipes={}}) {
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
          <h2 style={{color:"var(--text)",fontFamily:"'Playfair Display',serif",margin:"0 0 4px"}}>{t('nav.mealPlan',language)}</h2>
          <p style={{color:"var(--text-sub)",fontSize:13,margin:0}}>{mealPlanItems.length} {t('planner.subtitle',language).replace('{count}',mealPlanItems.length).split(' ').slice(1).join(' ')}</p>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setTab("plan")} style={{...GB,background:tab==="plan"?"rgba(58,125,94,0.22)":"var(--bg-card)",color:tab==="plan"?"var(--accent)":"var(--text-sub)",borderRadius:20,padding:"7px 18px",fontSize:13}}>📅 {t('planner.weeklyPlan',language)}</button>
          {onGoShopping && <button onClick={onGoShopping} style={{...GB,background:"rgba(90,143,212,0.15)",color:"#7ab0f0",borderRadius:20,padding:"7px 18px",fontSize:13}}>{t('planner.shoppingList',language)}</button>}
        </div>
      </div>

      {tab==="plan" && (
        <div>
          <div style={{background:"var(--nm-input-bg)",border:"1px solid var(--border)",borderRadius:14,padding:16,marginBottom:18}}>
            <div style={{color:"var(--text-sub)",fontWeight:600,fontSize:14,marginBottom:12}}>➕ Add recipe to plan</div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
              <div style={{flex:2,minWidth:160}}>
                <div style={{color:"var(--text-sub)",fontSize:10,fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>Recipe</div>
                <select value={(addRec&&addRec.id)||""} onChange={e=>{const r=recipes.find(x=>x.id===+e.target.value);setAddRec(r||null);}} style={IS}>
                  <option value="">— Select —</option>
                  {recipes.map(r=><option key={r.id} value={r.id}>{r.title}</option>)}
                </select>
              </div>
              <div>
                <div style={{color:"var(--text-sub)",fontSize:10,fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>Portions</div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <button onClick={()=>setAddPortions(v=>Math.max(1,v-1))} style={{...GB,padding:"5px 10px"}}>−</button>
                  <span style={{color:"var(--text)",fontWeight:700,minWidth:20,textAlign:"center"}}>{addPortions}</span>
                  <button onClick={()=>setAddPortions(v=>v+1)} style={{...GB,padding:"5px 10px"}}>+</button>
                </div>
              </div>
              <div style={{flex:1,minWidth:130}}>
                <div style={{color:"var(--text-sub)",fontSize:10,fontWeight:700,marginBottom:4,textTransform:"uppercase"}}>{t('planner.day',language)}</div>
                <select value={addDay} onChange={e=>setAddDay(e.target.value)} style={IS}>
                  {DAYS.map(d=><option key={d} value={d}>{t('day.'+d.toLowerCase(),language)}</option>)}
                </select>
              </div>
              <button onClick={addItem} disabled={!addRec} style={{background:addRec?"linear-gradient(135deg,#3a7d5e,#5aad8e)":"var(--nm-input-bg)",border:"none",borderRadius:10,color:addRec?"#fff":"var(--text-muted)",padding:"11px 18px",fontWeight:700,fontSize:13,cursor:addRec?"pointer":"not-allowed",fontFamily:"inherit"}}>{t('planner.add2',language)}</button>
            </div>
          </div>

          {mealPlanItems.length===0
            ? <div style={{textAlign:"center",padding:"48px 0",color:"var(--text-muted)"}}><div style={{fontSize:42,marginBottom:10}}>📅</div><div style={{fontSize:15,color:"var(--text-sub)"}}>{t('planner.noMeals',language)}</div></div>
            : <div style={{display:"grid",gap:10}}>
                {DAYS.map(day=>{
                  const items = mealPlanItems.filter(i=>i.day===day);
                  if (!items.length) return null;
                  const dayKcal = items.reduce((a,i)=>a+((i.nutrition&&i.nutrition.calories)||0),0);
                  return (
                    <div key={day} style={{background:"var(--nm-input-bg)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}}>
                      <div style={{padding:"10px 16px",borderBottom:"1px solid var(--border)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{color:"var(--text)",fontWeight:700,fontSize:14}}>{t('day.'+day.toLowerCase(),language)}</span>
                        {dayKcal>0 && <span style={{color:"var(--text-muted)",fontSize:12}}>{dayKcal} kcal</span>}
                      </div>
                      <div style={{padding:"10px 12px",display:"grid",gap:8}}>
                        {items.map(item=>(
                          <div key={item.id} style={{display:"flex",alignItems:"center",gap:10,background:"var(--bg-card)",borderRadius:10,overflow:"hidden",border:"1px solid var(--border)"}}>
                            {item.recipe?.image && <img src={item.recipe.image} alt={item.name} style={{width:56,height:56,objectFit:"cover",flexShrink:0}}/>}
                            <div style={{flex:1,minWidth:0,padding:item.recipe?.image?"6px 0":"8px 12px"}}>
                              <div style={{color:"var(--text)",fontWeight:600,fontSize:13}}>{(item.recipe?.id && translatedRecipes[item.recipe.id]?.title) || item.name}</div>
                              <div style={{color:"var(--text-muted)",fontSize:11,marginTop:2}}>{item.portions} portion{item.portions!==1?"s":""}{item.nutrition&&item.nutrition.calories?" · "+item.nutrition.calories+"kcal":""}</div>
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
            ? <div style={{textAlign:"center",padding:"48px 0",color:"#5a6a7a"}}><div style={{fontSize:38,marginBottom:10}}>🛒</div><div style={{fontSize:14,color:"#8a9bb0"}}>{t('shopping.noItems',language)}</div></div>
            : bySection
              ? SECTION_INFO.map(sec=>{
                  const items = shoppingList.filter(item=>categorizeItem(item.name)===sec.key);
                  if (!items.length) return null;
                  return (
                    <div key={sec.key} style={{marginBottom:14}}>
                      <div style={{color:sec.color,fontWeight:700,fontSize:13,marginBottom:8}}>{sec.icon} {t('shopping.'+sec.key,language)||sec.label}</div>
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
// ─── RECIPE AUDIT MODAL ──────────────────────────────────────────────────────
function RecipeAuditModal({recipes, onClose, onSave}) {
  // results: {recipeId, status: 'pending'|'checking'|'done'|'error', suggestions}
  const [results, setResults] = useState(() =>
    recipes.map(r => ({recipeId:r.id, recipeName:r.title, status:'pending', suggestions:null}))
  );
  const [currentIdx, setCurrentIdx] = useState(-1); // -1 = not started
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);

  const updResult = (id, patch) => setResults(rs => rs.map(r => r.recipeId===id ? {...r,...patch} : r));

  const runAudit = async () => {
    setRunning(true); runningRef.current = true;
    for (let i = 0; i < recipes.length; i++) {
      if (!runningRef.current) break;
      const recipe = recipes[i];
      setCurrentIdx(i);
      updResult(recipe.id, {status:'checking', fetchMsg: recipe.sourceUrl ? "Fetching source…" : ""});
      const ingList = (recipe.ingredients||[]).map(x=>`${x.amount} ${x.unit} ${x.name}`).join("\n");
      const stepList = (recipe.steps||[]).map((s,idx)=>`${idx+1}. ${s.text}`).join("\n");

      // Fetch the source page if URL is stored
      let sourceText = "";
      if (recipe.sourceUrl?.trim()) {
        const page = await fetchPageContent(recipe.sourceUrl.trim());
        if (page?.text) sourceText = page.text.slice(0, 12000);
      }
      updResult(recipe.id, {fetchMsg: "Comparing…"});

      const hasSource = !!sourceText;
      try {
        const raw = await anthropicCall({
          max_tokens:1000,
          system:"You are a culinary expert auditing recipes. Return ONLY valid JSON, no markdown.",
          messages:[{role:"user",content:`Recipe in app: "${recipe.title}" (${recipe.category||"dish"})

Ingredients in app:
${ingList||"(none)"}

Steps in app:
${stepList||"(none)"}

${hasSource
  ? `SOURCE PAGE CONTENT (use as ground truth — compare every ingredient and step):\n${sourceText}\n\nList everything present in the source page but missing from the app version.`
  : `No source URL. Based on the dish name and existing content, flag clearly missing items.`
}

Return JSON:
{"missingIngredients":[{"name":"","amount":1,"unit":"","reason":""}],"missingSteps":[{"text":"","timeMin":5,"insertAfter":-1,"reason":""}],"notes":""}
Empty arrays if complete.`}]
        });
        const m = raw.match(/\{[\s\S]*\}/);
        const suggestions = m ? {...JSON.parse(m[0]), usedSource: hasSource} : {missingIngredients:[],missingSteps:[],usedSource:false};
        const hasIssues = (suggestions.missingIngredients||[]).length>0 || (suggestions.missingSteps||[]).length>0;
        updResult(recipe.id, {status:'done', suggestions, hasIssues, fetchMsg:""});
      } catch(e) {
        updResult(recipe.id, {status:'error', error: e.message, fetchMsg:""});
      }
    }
    setRunning(false); runningRef.current = false; setCurrentIdx(-1);
  };

  const stopAudit = () => { runningRef.current = false; setRunning(false); };

  const acceptIng = (recipeId, ing) => {
    const recipe = recipes.find(r=>r.id===recipeId);
    if (!recipe) return;
    const updated = {...recipe, ingredients:[...recipe.ingredients,{name:ing.name,amount:ing.amount||1,unit:ing.unit||"",image:null}]};
    onSave(updated);
    updResult(recipeId, {suggestions: results.find(r=>r.recipeId===recipeId)?.suggestions && {
      ...results.find(r=>r.recipeId===recipeId).suggestions,
      missingIngredients: (results.find(r=>r.recipeId===recipeId).suggestions.missingIngredients||[]).filter(i=>i.name!==ing.name)
    }});
  };

  const acceptStep = (recipeId, st) => {
    const recipe = recipes.find(r=>r.id===recipeId);
    if (!recipe) return;
    const steps = [...recipe.steps];
    const pos = st.insertAfter >= 0 && st.insertAfter < steps.length ? st.insertAfter+1 : steps.length;
    steps.splice(pos, 0, {text:st.text, timeMin:st.timeMin||5, imagePrompt:""});
    onSave({...recipe, steps});
    updResult(recipeId, {suggestions: results.find(r=>r.recipeId===recipeId)?.suggestions && {
      ...results.find(r=>r.recipeId===recipeId).suggestions,
      missingSteps: (results.find(r=>r.recipeId===recipeId).suggestions.missingSteps||[]).filter(i=>i.text!==st.text)
    }});
  };

  const done = results.filter(r=>r.status==='done').length;
  const withIssues = results.filter(r=>r.hasIssues).length;

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:1200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"var(--bg-card)",borderRadius:20,maxWidth:680,width:"100%",maxHeight:"90vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"var(--nm-raised)"}}>
        {/* Header */}
        <div style={{padding:"18px 20px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
          <div style={{flex:1}}>
            <div style={{color:"var(--text)",fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:17}}>🔍 Recipe Audit</div>
            <div style={{color:"var(--text-muted)",fontSize:12,marginTop:2}}>
              {currentIdx>=0 ? `Checking ${results[currentIdx]?.recipeName}… (${currentIdx+1}/${recipes.length})` :
               done > 0 ? `${done}/${recipes.length} checked · ${withIssues} recipes with suggestions` :
               `Check all ${recipes.length} recipes for missing ingredients & steps`}
            </div>
          </div>
          {!running
            ? <button onClick={runAudit} style={{background:"linear-gradient(135deg,var(--accent2),var(--accent))",border:"none",borderRadius:10,color:"#fff",padding:"8px 16px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
                {done>0?"🔄 Re-check All":"▶ Start Audit"}
              </button>
            : <button onClick={stopAudit} style={{...GB,padding:"7px 14px",fontSize:13,color:"#f08080"}}>⏹ Stop</button>
          }
          <button onClick={onClose} style={{...GB,padding:"5px 10px",fontSize:16}}>×</button>
        </div>

        {/* Progress bar */}
        {(running || done > 0) && (
          <div style={{height:3,background:"var(--border)",flexShrink:0}}>
            <div style={{height:"100%",width:(done/recipes.length*100)+"%",background:"var(--accent)",transition:"width .4s"}}/>
          </div>
        )}

        {/* Results list */}
        <div style={{flex:1,overflowY:"auto",padding:16}}>
          {results.map(res => {
            const {missingIngredients=[], missingSteps=[]} = res.suggestions||{};
            const total = missingIngredients.length + missingSteps.length;
            return (
              <div key={res.recipeId} style={{background:"var(--nm-input-bg)",borderRadius:12,padding:"12px 14px",marginBottom:10,border: res.hasIssues?"1px solid rgba(255,213,128,0.25)":"1px solid transparent"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom: total>0?10:0}}>
                  <span style={{fontSize:16}}>
                    {res.status==='pending'?"⬜":res.status==='checking'?"⏳":res.status==='error'?"❌":res.hasIssues?"⚠️":"✅"}
                  </span>
                  <div style={{flex:1,minWidth:0}}>
                    <span style={{color:"var(--text)",fontSize:13,fontWeight:600}}>{res.recipeName}</span>
                    {res.status==='checking' && res.fetchMsg && <span style={{color:"var(--accent)",fontSize:11,marginLeft:8}}>{res.fetchMsg}</span>}
                    {res.status==='done' && res.suggestions?.usedSource && <span style={{color:"#5a8fd4",fontSize:10,marginLeft:6}}>🌐 vs source</span>}
                  </div>
                  {res.status==='done' && !res.hasIssues && <span style={{color:"#5aad8e",fontSize:11,flexShrink:0}}>Complete</span>}
                  {res.status==='done' && res.hasIssues && <span style={{color:"#ffd580",fontSize:11,flexShrink:0}}>{total} suggestion{total!==1?"s":""}</span>}
                  {res.status==='error' && <span style={{color:"#f08080",fontSize:11,flexShrink:0}}>Error</span>}
                  {res.status==='pending' && <span style={{color:"var(--text-muted)",fontSize:11,flexShrink:0}}>{res.recipeName.sourceUrl?"🌐":"📝"}</span>}
                </div>

                {/* Suggestions */}
                {missingIngredients.length > 0 && (
                  <div style={{marginBottom:8}}>
                    <div style={{color:"#ffd580",fontSize:11,fontWeight:700,marginBottom:5}}>Missing ingredients:</div>
                    {missingIngredients.map((ing,i)=>(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",borderRadius:7,background:"rgba(255,213,128,0.07)",marginBottom:3}}>
                        <span style={{flex:1,color:"var(--text)",fontSize:12}}><b>{ing.amount} {ing.unit} {ing.name}</b> <span style={{color:"var(--text-muted)",fontWeight:400}}>— {ing.reason}</span></span>
                        <button onClick={()=>acceptIng(res.recipeId,ing)} style={{...GB,padding:"2px 9px",fontSize:11,color:"#5aad8e",border:"1px solid rgba(90,173,142,0.3)"}}>+ Add</button>
                      </div>
                    ))}
                  </div>
                )}
                {missingSteps.length > 0 && (
                  <div>
                    <div style={{color:"#5a8fd4",fontSize:11,fontWeight:700,marginBottom:5}}>Missing steps:</div>
                    {missingSteps.map((st,i)=>(
                      <div key={i} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"5px 8px",borderRadius:7,background:"rgba(90,143,212,0.07)",marginBottom:3}}>
                        <span style={{flex:1,color:"var(--text)",fontSize:12}}>{st.text}{st.timeMin?<span style={{color:"var(--text-muted)"}}> ({st.timeMin}m)</span>:""} <span style={{color:"var(--text-muted)",fontWeight:400}}>— {st.reason}</span></span>
                        <button onClick={()=>acceptStep(res.recipeId,st)} style={{...GB,padding:"2px 9px",fontSize:11,color:"#5a8fd4",border:"1px solid rgba(90,143,212,0.3)",flexShrink:0}}>+ Add</button>
                      </div>
                    ))}
                  </div>
                )}
                {res.suggestions?.notes && <div style={{color:"var(--text-muted)",fontSize:11,marginTop:6,fontStyle:"italic"}}>{res.suggestions.notes}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── COMFORT MEAL MODAL ──────────────────────────────────────────────────────
function ComfortMealModal({onClose, onLog, language='en'}) {
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const handle = () => {
    if (!name.trim()) return;
    onLog(name.trim(), notes.trim());
    onClose();
  };
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"var(--bg-card)",borderRadius:22,padding:28,width:"100%",maxWidth:380,boxShadow:"var(--nm-raised)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div>
            <div style={{color:"var(--text)",fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:18}}>{t('comfort.title',language)}</div>
            <div style={{color:"var(--text-muted)",fontSize:12,marginTop:3}}>{t('comfort.subtitle',language)}</div>
          </div>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:"var(--text-muted)",fontSize:20,cursor:"pointer",padding:4,lineHeight:1}}>✕</button>
        </div>
        <div style={{marginBottom:14}}>
          <label style={{color:"var(--text-sub)",fontSize:12,display:"block",marginBottom:5}}>{t('comfort.whatLabel',language)}</label>
          <input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()} placeholder="e.g. Mom's pasta, chicken stir-fry…"
            autoFocus
            style={{background:"var(--nm-input-bg)",boxShadow:"var(--nm-inset)",border:"none",borderRadius:10,color:"var(--text)",padding:"10px 14px",fontSize:14,outline:"none",width:"100%",boxSizing:"border-box",fontFamily:"inherit"}}/>
        </div>
        <div style={{marginBottom:22}}>
          <label style={{color:"var(--text-sub)",fontSize:12,display:"block",marginBottom:5}}>Notes (optional)</label>
          <input value={notes} onChange={e=>setNotes(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()} placeholder={t('comfort.notesPlaceholder',language)}
            style={{background:"var(--nm-input-bg)",boxShadow:"var(--nm-inset)",border:"none",borderRadius:10,color:"var(--text)",padding:"10px 14px",fontSize:14,outline:"none",width:"100%",boxSizing:"border-box",fontFamily:"inherit"}}/>
        </div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onClose} style={{flex:1,background:"var(--bg-card)",boxShadow:"var(--nm-raised-sm)",border:"none",borderRadius:12,color:"var(--text-sub)",padding:"12px",fontWeight:600,cursor:"pointer",fontFamily:"inherit",fontSize:14}}>Cancel</button>
          <button onClick={handle} disabled={!name.trim()}
            style={{flex:2,background:name.trim()?"linear-gradient(135deg,#d4875a,#ffd580)":"var(--nm-input-bg)",border:"none",borderRadius:12,color:name.trim()?"#fff":"var(--text-muted)",padding:"12px",fontWeight:800,cursor:name.trim()?"pointer":"default",fontFamily:"inherit",fontSize:14,boxShadow:name.trim()?"var(--nm-raised-sm)":"none"}}>
            🔥 Log It
          </button>
        </div>
      </div>
    </div>
  );
}

function FavoritesView({favorites, recipes, setFavorites, onView, onExportBook, language='en', translatedRecipes={}}) {
  const dr = (r: any) => (r && language !== 'en' && translatedRecipes[r.id]) ? translatedRecipes[r.id] : r;
  const favRecipes = favorites.map(f=>recipes.find(r=>r.id===f.id)||f).filter(Boolean);
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:10}}>
        <div>
          <h2 style={{color:"#fff",fontFamily:"'Playfair Display',serif",margin:"0 0 4px"}}>Favorites</h2>
          <p style={{color:"#8a9bb0",fontSize:13,margin:0}}>{favRecipes.length} saved recipes</p>
        </div>
        {favRecipes.length>0 && (
          <button onClick={()=>exportMealBookToPDF(favRecipes.map(dr),"My Favorite Recipes",language)} style={{...GB}}>📚 Export Cookbook PDF</button>
        )}
      </div>
      {favRecipes.length===0
        ? <div style={{textAlign:"center",padding:"70px 0"}}>
            <div style={{fontSize:48,marginBottom:14}}>♡</div>
            <div style={{color:"#fff",fontSize:17,fontFamily:"'Playfair Display',serif",marginBottom:6}}>{t('fav.empty',language)}</div>
            <div style={{color:"#6a7a90",fontSize:13}}>{t('fav.emptyHint',language)}</div>
          </div>
        : <div className="r-grid">
            {favRecipes.map(r=>(
              <RecipeCard key={r.id} recipe={dr(r)} onClick={()=>onView(dr(r))}
                onFavorite={()=>setFavorites(p=>p.filter(f=>f.id!==r.id))} isFavorite={true} language={language}/>
            ))}
          </div>
      }
    </div>
  );
}

// ─── INGREDIENT SEARCH ────────────────────────────────────────────────────────
function IngredientSearch({recipes, onView, language='en', translatedRecipes={}}) {
  const dr = (r: any) => (r && language !== 'en' && translatedRecipes[r.id]) ? translatedRecipes[r.id] : r;
  const [query, setQuery] = useState("");
  const results = query.trim().length>1
    ? recipes.filter(r=>(r.ingredients||[]).some(i=>(i.name||"").toLowerCase().includes(query.toLowerCase())))
    : [];
  return (
    <div>
      <h2 style={{color:"#fff",fontFamily:"'Playfair Display',serif",marginBottom:6}}>{t('ingSearch.title',language)}</h2>
      <p style={{color:"#8a9bb0",fontSize:13,marginBottom:18}}>{t('ingSearch.subtitle',language)}</p>
      <input value={query} onChange={e=>setQuery(e.target.value)} placeholder={t('ingSearch.placeholder',language)}
        style={{...IS,marginBottom:20,fontSize:15}}/>
      {query.trim().length>1 && (
        results.length===0
          ? <div style={{textAlign:"center",padding:"48px 0",color:"#5a6a7a"}}>{t('ingSearch.noResults',language,{query})}</div>
          : <div className="r-grid">
              {results.map(r=><RecipeCard key={r.id} recipe={dr(r)} onClick={()=>onView(dr(r))} language={language}/>)}
            </div>
      )}
    </div>
  );
}

// ─── RATING MODAL ─────────────────────────────────────────────────────────────
function RatingModal({recipe, existing, onSave, onClose, language='en'}) {
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
  const ratingLabels = [
    [t('rating.taste',language),taste,setTaste],
    [t('rating.difficulty',language),difficulty,setDifficulty],
    [t('rating.timeAccuracy',language),timeAccuracy,setTimeAccuracy],
    [t('rating.spice',language),spice,setSpice],
  ];
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:1001,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#0d0f17",border:"1px solid rgba(255,255,255,0.08)",borderRadius:20,padding:28,maxWidth:400,width:"100%"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h3 style={{color:"#fff",fontFamily:"'Playfair Display',serif",margin:0}}>{t('rating.title',language)} {recipe.title}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#6a7a90",cursor:"pointer",fontSize:22}}>×</button>
        </div>
        {ratingLabels.map(([label,val,set])=>(
          <div key={label} style={{marginBottom:16}}>
            <div style={{color:"#8a9bb0",fontSize:13,marginBottom:8}}>{label}</div>
            <Stars val={val} set={set}/>
          </div>
        ))}
        <button onClick={()=>{onSave(recipe.id,{taste,difficulty,timeAccuracy,spice});onClose();}} style={{width:"100%",background:"linear-gradient(135deg,#3a7d5e,#5aad8e)",border:"none",borderRadius:12,color:"#fff",padding:14,fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>
          {t('rating.save',language)}
        </button>
      </div>
    </div>
  );
}

// ─── COOK MODE HELPERS ───────────────────────────────────────────────────────
// Parse a temperature value from step text → {c, f, label}
const parseStepTemp = (text) => {
  const t = text || '';
  const mC = t.match(/(\d{2,3})\s*°?\s*C\b/i);
  const mF = t.match(/(\d{2,3})\s*°?\s*F\b/i);
  if (mC) {
    const c = parseInt(mC[1]);
    const f = Math.round(c * 9/5 + 32);
    const label = c >= 230 ? 'High Heat' : c >= 190 ? 'Medium High' : c >= 160 ? 'Medium' : 'Low / Simmer';
    return { c, f, label };
  }
  if (mF) {
    const f = parseInt(mF[1]);
    const c = Math.round((f - 32) * 5/9);
    const label = f >= 450 ? 'High Heat' : f >= 375 ? 'Medium High' : f >= 325 ? 'Medium' : 'Low / Simmer';
    return { c, f, label };
  }
  return null;
};

// Detect primary appliance from step text
const detectStepAppliance = (text) => {
  const t = (text || '').toLowerCase();
  if (/air\s?fry|air fryer/.test(t)) return 'airfryer';
  if (/\boven\b|bake|roast/.test(t)) return 'oven';
  if (/rice cooker/.test(t)) return 'ricecooker';
  if (/instant pot|pressure cook/.test(t)) return 'instantpot';
  if (/\bblend|blender|puree|smoothie/.test(t)) return 'blender';
  if (/\bmicrowave\b/.test(t)) return 'microwave';
  if (/\bstove|skillet|pan|sauté|saute|sear|fry|simmer|boil/.test(t)) return 'stove';
  return null;
};

// Detect cutting / prep techniques from step text
const detectTechniques = (text) => {
  const t = (text || '').toLowerCase();
  const out = [];
  if (/\bdice\b/.test(t)) out.push('Dice');
  if (/\bslice\b/.test(t)) out.push('Slice');
  if (/\bjulienne\b/.test(t)) out.push('Julienne');
  if (/\bchop\b/.test(t)) out.push('Chop');
  if (/\bmince\b/.test(t)) out.push('Mince');
  if (/\bgrate\b|\bshred\b/.test(t)) out.push('Grate');
  return out;
};

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

// Convert a cooking step's temperatures and time for air fryer use
// Rule: reduce oven temp by 25°F / 15°C, reduce time by ~25%
const convertStepForAirFryer = (text, timeMin) => {
  const convText = text
    .replace(/(\d+)\s*°\s*F/gi, (_, t) => `${+t - 25}°F`)
    .replace(/(\d+)\s*°\s*C/gi, (_, t) => `${+t - 15}°C`);
  const convTime = timeMin ? Math.max(1, Math.round(timeMin * 0.75)) : null;
  return { text: convText, timeMin: convTime, changed: convText !== text || (timeMin && convTime !== timeMin) };
};

const ALARM_SOUNDS = [
  {key:"bell",  label:"Kitchen Bell", emoji:"🔔"},
  {key:"beep",  label:"Oven Beep",    emoji:"📟"},
  {key:"chime", label:"Chime",        emoji:"🎵"},
  {key:"horn",  label:"Alarm Horn",   emoji:"🔊"},
  {key:"zen",   label:"Zen Bell",     emoji:"🧘"},
  {key:"none",  label:"Silent",       emoji:"🔕"},
];

// Persistent AudioContext — created once and unlocked on first user gesture
let _sharedAudioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!_sharedAudioCtx || _sharedAudioCtx.state === "closed") {
      _sharedAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (_sharedAudioCtx.state === "suspended") _sharedAudioCtx.resume();
    return _sharedAudioCtx;
  } catch(e) { return null; }
}
// Call this on any user click to pre-unlock audio before a timer fires
function unlockAudio() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const buf = ctx.createBuffer(1, 1, 22050);
  const src = ctx.createBufferSource();
  src.buffer = buf; src.connect(ctx.destination); src.start(0);
}

function playAlarmSound(type) {
  if (type === "none") return;
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const resume = ctx.state === "suspended" ? ctx.resume() : Promise.resolve();
    resume.then(() => {
      const tone = (freq, startTime, duration, vol=0.45, wave="sine") => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = wave;
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(vol, startTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        osc.start(startTime); osc.stop(startTime + duration + 0.05);
      };
      const t = ctx.currentTime;
      if (type === "bell") {
        [0, 0.65, 1.3].forEach(d => { tone(880, t+d, 1.1, 0.4); tone(1320, t+d+0.01, 0.8, 0.15); });
      } else if (type === "beep") {
        [0, 0.38, 0.76, 1.14].forEach(d => tone(1100, t+d, 0.28, 0.5, "square"));
      } else if (type === "chime") {
        [[523,0],[659,0.22],[784,0.44],[1047,0.66],[784,1.0],[1047,1.22]].forEach(([f,d]) => tone(f, t+d, 0.65, 0.32));
      } else if (type === "horn") {
        tone(330, t, 0.5, 0.6, "sawtooth");
        tone(440, t+0.5, 0.5, 0.6, "sawtooth");
        tone(550, t+1.0, 0.9, 0.6, "sawtooth");
      } else if (type === "zen") {
        tone(528, t, 4.0, 0.5); tone(792, t+0.06, 3.0, 0.2); tone(1056, t+0.12, 2.0, 0.08);
      }
    });
  } catch(e) { console.warn("Audio playback failed", e); }
}

function CookMode({recipe, onClose, onMarkCooked=null, language='en'}) {
  const [phase, setPhase] = useState("prep"); // "prep" | "cook"
  const [step, setStep] = useState(0);
  const [prepGuide, setPrepGuide] = useState(()=>buildStaticPrepGuide(recipe));
  const [loadingAI, setLoadingAI] = useState(false);
  const [checked, setChecked] = useState({});
  const [stepTimers, setStepTimers] = useState({}); // { stepIdx: {remaining:secs, running:bool} }
  const prevTimersRef = useRef({});
  const sidebarRef = useRef(null);
  const stepRowRefs = useRef({});
  const [afMode, setAfMode] = useState(false); // air fryer conversion mode
  const [alarmSound, setAlarmSound] = useState(()=>{ try{return localStorage.getItem("cookAlarm")||"bell";}catch(e){return "bell";} });
  const alarmSoundRef = useRef(alarmSound);
  const [eatAt, setEatAt] = useState("");
  const [showEatAt, setShowEatAt] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [cookCardMode, setCookCardMode] = useState({});
  const [isMobile, setIsMobile] = useState(false);
  const steps = recipe.steps||[];
  const current = steps[step]||{};
  const afStep = afMode ? convertStepForAirFryer(current.text||"", current.timeMin) : null;
  const toggleCheck = key => setChecked(c=>({...c,[key]:!c[key]}));

  const eatAtSchedule = useMemo(()=>{
    if (!eatAt) return {};
    const [h,m] = eatAt.split(":").map(Number);
    let endMins = h*60+m;
    const sched = {};
    for (let i=steps.length-1; i>=0; i--) {
      const dur = (afMode&&i===step&&afStep?.timeMin ? afStep.timeMin : steps[i].timeMin)||0;
      const startMins = endMins - dur;
      const sh = Math.floor(((startMins%1440)+1440)%1440/60);
      const sm = ((startMins%1440)+1440)%1440%60;
      const ampm = sh>=12?"PM":"AM"; const sh12 = sh%12||12;
      sched[i] = {startLabel:`${sh12}:${String(sm).padStart(2,"0")} ${ampm}`};
      endMins = startMins;
    }
    return sched;
  },[eatAt, steps, afMode, afStep, step]);

  // Persist alarm sound choice
  useEffect(()=>{ alarmSoundRef.current=alarmSound; lsSave("cookAlarm",alarmSound); },[alarmSound]);

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

  // Initialize timer when navigating to a step
  useEffect(()=>{
    const mins = afMode && afStep?.timeMin ? afStep.timeMin : current.timeMin;
    if (mins && !(step in stepTimers)) {
      setStepTimers(t=>({...t,[step]:{remaining:mins*60,running:false}}));
    }
  },[step,afMode]);

  // Single global tick
  useEffect(()=>{
    const id = setInterval(()=>{
      setStepTimers(prev=>{
        const anyRunning = Object.values(prev).some(t=>t.running&&t.remaining>0);
        if (!anyRunning) return prev;
        const next={};
        Object.entries(prev).forEach(([k,t])=>{
          next[k] = (t.running && t.remaining>0) ? {...t,remaining:t.remaining-1,running:t.remaining>1} : t;
        });
        return next;
      });
    },1000);
    return ()=>clearInterval(id);
  },[]);

  // Detect completion
  useEffect(()=>{
    Object.entries(stepTimers).forEach(([k,t])=>{
      const prev=prevTimersRef.current[k];
      if (prev?.running && !t.running && t.remaining===0) {
        playAlarmSound(alarmSoundRef.current);
        try{new Notification("⏰ Step "+(parseInt(k)+1)+" done!",{body:steps[parseInt(k)]?.text?.slice(0,60)});}catch(e){}
      }
    });
    prevTimersRef.current=stepTimers;
  },[stepTimers]);

  // Wake lock — keep screen on
  useEffect(()=>{ let wl; try{if(navigator.wakeLock)navigator.wakeLock.request("screen").then(w=>wl=w);}catch(e){} return()=>{try{wl?.release();}catch(e){}};  },[]);

  // Voice narration
  useEffect(()=>{
    if (voiceOn && phase==="cook" && typeof window!=="undefined" && window.speechSynthesis) {
      const utt = new SpeechSynthesisUtterance((afMode&&afStep ? afStep.text : current.text)||"");
      utt.rate = 0.9; utt.pitch = 1;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utt);
    }
  },[step, voiceOn, phase]);

  // Cancel speech on unmount
  useEffect(()=>()=>{ try{window.speechSynthesis?.cancel();}catch(e){} },[]);

  // Auto-scroll sidebar to keep active step visible
  useEffect(()=>{
    const row = stepRowRefs.current[step];
    if (row && sidebarRef.current) row.scrollIntoView({block:'nearest',behavior:'smooth'});
  },[step]);

  // Reset appliance card mode selections when step changes
  useEffect(()=>{ setCookCardMode({}); },[step]);

  // Detect mobile viewport
  useEffect(()=>{
    const check=()=>setIsMobile(window.innerWidth<640);
    check();
    window.addEventListener('resize',check);
    return()=>window.removeEventListener('resize',check);
  },[]);

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
            <div style={{color:"var(--text-muted)",fontSize:11,marginTop:2}}>🧑‍🍳 {t('cook.prepPhase',language)} · {doneCount}/{totalAllTasks.length} {t('cook.tasksDone',language).replace('{done}',doneCount).replace('{total}',totalAllTasks.length).split(' ').slice(1).join(' ')} {loadingAI&&"· "+t('cook.aiEnhancing',language)}</div>
          </div>
          {doneCount>0&&<div style={{color:"var(--accent)",fontSize:12,fontWeight:700}}>{Math.round(doneCount/Math.max(totalAllTasks.length,1)*100)}%</div>}
        </div>
        {/* Progress */}
        <div style={{height:3,background:"var(--border)"}}><div style={{height:"100%",width:(totalAllTasks.length?doneCount/totalAllTasks.length*100:0)+"%",background:"var(--accent)",transition:"width .3s"}}/></div>

        <div style={{flex:1,overflowY:"auto",padding:"18px 16px 100px",maxWidth:680,margin:"0 auto",width:"100%"}}>
          {/* Hero image */}
          {recipe.image && <div style={{borderRadius:16,overflow:"hidden",marginBottom:18,height:160,boxShadow:"var(--nm-raised)"}}><img src={recipe.image} alt={recipe.title} style={{width:"100%",height:"100%",objectFit:"cover"}}/></div>}

          {/* Optimization checklist */}
          <Section icon="🔥" title={t('cook.preheatFirst',language)} color="#e07a40" items={ph} offset={offset} />
          {offset+=ph.length}
          <Section icon="⏱" title={t('cook.startFirst',language)} color="#ffd580" items={sf} offset={offset}/>
          {offset+=sf.length}
          <Section icon="🚿" title={t('cook.washClean',language)} color="#5a8fd4" items={ws} offset={offset}/>
          {offset+=ws.length}
          <Section icon="🔪" title={t('cook.prepCut',language)} color="#d4875a" items={pr} offset={offset}/>

          {/* Chef tips */}
          {(prepGuide.tips||[]).length>0 && (
            <div style={{background:"rgba(90,173,142,0.08)",border:"1px solid rgba(90,173,142,0.25)",borderRadius:12,padding:"12px 14px",marginBottom:18}}>
              <div style={{color:"#5aad8e",fontWeight:700,fontSize:12,marginBottom:8}}>👨‍🍳 {t('cook.chefTips',language)}</div>
              {(prepGuide.tips||[]).map((t,i)=>(
                <div key={i} style={{color:"var(--text-sub)",fontSize:13,lineHeight:1.5,marginBottom:4}}>• {t}</div>
              ))}
            </div>
          )}

          {/* Ingredients overview */}
          <div style={{marginBottom:18}}>
            <div style={{color:"var(--text-sub)",fontWeight:700,fontSize:12,letterSpacing:.8,textTransform:"uppercase",marginBottom:10}}>🥗 {t('cook.allIngredients',language)} ({(recipe.ingredients||[]).length})</div>
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
          <div style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised)",borderRadius:16,overflow:"hidden"}}>
            <div style={{padding:"12px 14px 8px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:16}}>📋</span>
              <span style={{color:"var(--text)",fontWeight:700,fontSize:13}}>{t('cook.steps',language).replace('{count}',steps.length).replace('{time}',recipe.totalTime||0)}</span>
              {recipe.totalTime&&<span style={{marginLeft:"auto",background:"rgba(90,173,142,0.15)",color:"var(--accent)",borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:700}}>~{recipe.totalTime} min total</span>}
            </div>
            {steps.map((s,i)=>(
              <div key={i} style={{display:"flex",gap:12,padding:"11px 14px",borderBottom:i<steps.length-1?"1px solid var(--border)":"none",alignItems:"flex-start"}}>
                <div style={{width:26,height:26,borderRadius:"50%",background:STEP_COLORS[i%STEP_COLORS.length],color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,flexShrink:0,marginTop:1,boxShadow:"0 2px 6px rgba(0,0,0,0.15)"}}>{i+1}</div>
                <span style={{color:"var(--text-sub)",fontSize:12,flex:1,lineHeight:1.5}}>{s.text.slice(0,80)}{s.text.length>80?"…":""}</span>
                {s.timeMin&&<span style={{background:"var(--nm-input-bg)",color:"var(--text-muted)",borderRadius:20,padding:"2px 8px",fontSize:10,fontWeight:700,flexShrink:0,marginTop:2}}>⏱ {s.timeMin}m</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Start cooking button */}
        <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"14px 18px",background:"var(--bg-sidebar)",borderTop:"1px solid var(--border)",display:"flex",alignItems:"center",gap:12}}>
          <div style={{flex:1}}>
            <div style={{color:"var(--text-sub)",fontSize:12,fontWeight:600}}>{steps.length} steps · ~{recipe.totalTime||0} min</div>
            {doneCount>0 && <div style={{color:"var(--accent)",fontSize:11,marginTop:1}}>✓ {doneCount}/{totalAllTasks.length} prep tasks done</div>}
          </div>
          <button onClick={()=>{unlockAudio();setPhase("cook");}}
            style={{flex:2,background:"linear-gradient(135deg,var(--accent2),var(--accent))",border:"none",borderRadius:14,color:"#fff",padding:"15px",fontWeight:800,fontSize:16,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 16px rgba(58,125,94,0.4)",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            <span style={{fontSize:20}}>🍳</span> {t('cook.startCooking',language)}
          </button>
        </div>
      </div>
    );
  }

  // ── COOK PHASE ──────────────────────────────────────────────────────────────
  const progress = (step / (steps.length - 1 || 1)) * 100;
  const pct = Math.round((step + 1) / steps.length * 100);

  // Detect heat level from current step text
  const heatHint = (() => {
    const txt = (afMode && afStep ? afStep.text : current.text || '').toLowerCase();
    if (/high heat|sear|deep.?fry|very hot/.test(txt))   return {label:'High Heat',    range:'210–230°C', color:'#e05050', bars:4};
    if (/medium.high|sauté|saute|stir.?fry/.test(txt))   return {label:'Medium High',  range:'180–210°C', color:'#f5a623', bars:3};
    if (/\bmedium\b/.test(txt))                           return {label:'Medium Heat',  range:'150–180°C', color:'#ffd580', bars:2};
    if (/low heat|simmer|gentle|warm/.test(txt))         return {label:'Low / Simmer', range:'100–140°C', color:'#5a8fd4', bars:1};
    return null;
  })();

  // Map step index → cooking stage label
  const STAGE_LABELS = ['Prepare','Cook','Simmer','Serve'];
  const stageIdx = Math.min(3, Math.floor(step / steps.length * 4));

  // Timer for current step
  const cmTimeMin = afMode && afStep?.timeMin ? afStep.timeMin : current.timeMin;
  const cmTimer   = stepTimers[step] || {remaining: (cmTimeMin||0)*60, running: false};
  const cmRunning = cmTimer.running;
  const cmDone    = cmTimer.remaining === 0 && !!cmTimeMin;

  // Appliance context for current step
  const stepText = afMode && afStep ? afStep.text : current.text || '';
  const stepAppliance = detectStepAppliance(stepText);
  const stepTemp = parseStepTemp(stepText);
  const stepTechniques = detectTechniques(stepText);

  return (
    <div style={{position:'fixed',inset:0,background:'var(--bg)',zIndex:2000,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <style>{`
        .nm-range{-webkit-appearance:none;appearance:none;width:100%;height:6px;border-radius:3px;outline:none;cursor:pointer;background:var(--border)}
        .nm-range::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;background:var(--accent);cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.25),0 0 0 3px rgba(77,166,255,0.2);transition:box-shadow .2s}
        .nm-range::-moz-range-thumb{width:22px;height:22px;border-radius:50%;background:var(--accent);cursor:pointer;border:none;box-shadow:0 2px 8px rgba(0,0,0,0.25)}
        .nm-range-orange::-webkit-slider-thumb{background:#f5a623;box-shadow:0 2px 8px rgba(0,0,0,0.25),0 0 0 3px rgba(245,166,35,0.25)}
        .nm-range-orange::-moz-range-thumb{background:#f5a623}
        .nm-range-green::-webkit-slider-thumb{background:#5aad8e;box-shadow:0 2px 8px rgba(0,0,0,0.25),0 0 0 3px rgba(90,173,142,0.25)}
        .nm-range-green::-moz-range-thumb{background:#5aad8e}
      `}</style>

      {/* ── TOP BAR ── */}
      <div style={{padding:isMobile?'7px 8px':'9px 12px',background:'var(--bg-sidebar)',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:isMobile?4:7,flexShrink:0,flexWrap:'nowrap',overflowX:'auto'}}>
        <button onClick={()=>setPhase('prep')} style={{...GB,padding:'5px 10px',fontSize:12}}>← {t('cook.prepPhase',language)}</button>
        <div style={{flex:1,textAlign:'center',minWidth:0,overflow:'hidden'}}>
          <div style={{color:'var(--text)',fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:15,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{recipe.title}</div>
        </div>
        <button onClick={()=>setAfMode(m=>!m)}
          style={{...GB,padding:'5px 8px',fontSize:11,background:afMode?'rgba(255,160,50,0.18)':'var(--bg-card)',color:afMode?'#f5a623':'var(--text-sub)',border:afMode?'1px solid rgba(255,160,50,0.5)':'none',fontWeight:afMode?700:400}}
          title="Air Fryer mode">🌬️</button>
        <button onClick={()=>setShowEatAt(v=>!v)}
          style={{...GB,padding:'5px 8px',fontSize:12,background:eatAt?'rgba(90,143,212,0.18)':'var(--bg-card)',color:eatAt?'#5a8fd4':'var(--text-sub)',border:eatAt?'1px solid rgba(90,143,212,0.5)':'none'}}
          title="Eat-at scheduler">🍽</button>
        <button onClick={()=>setVoiceOn(v=>!v)}
          style={{...GB,padding:'5px 8px',fontSize:12,background:voiceOn?'rgba(90,173,142,0.18)':'var(--bg-card)',color:voiceOn?'#5aad8e':'var(--text-sub)',border:voiceOn?'1px solid rgba(90,173,142,0.5)':'none'}}
          title="Voice narration">{voiceOn?'🔊':'🔇'}</button>
        <button onClick={onClose} style={{...GB,padding:'5px 10px',fontSize:13}}>✕</button>
      </div>

      {/* Eat-at panel */}
      {showEatAt && (
        <div style={{background:'rgba(90,143,212,0.08)',borderBottom:'1px solid rgba(90,143,212,0.2)',padding:'8px 14px',display:'flex',alignItems:'center',gap:10,flexShrink:0,flexWrap:'wrap'}}>
          <span style={{color:'#5a8fd4',fontSize:13,fontWeight:700}}>{t('cook.eatAtLabel',language)}</span>
          <input type="time" value={eatAt} onChange={e=>setEatAt(e.target.value)} style={{...IS,width:110,height:30,padding:'0 8px',fontSize:13,fontWeight:700,color:'#5a8fd4'}}/>
          {eatAt && <button onClick={()=>{setEatAt('');setShowEatAt(false);}} style={{...GB,padding:'3px 8px',fontSize:11,color:'var(--text-muted)'}}>{t('cook.clear',language)}</button>}
          {eatAt && <span style={{color:'var(--text-muted)',fontSize:11}}>Step 1 at {eatAtSchedule[0]?.startLabel}</span>}
        </div>
      )}

      {/* ── STAGE FLOW + PROGRESS ── */}
      <div style={{background:'var(--bg-sidebar)',borderBottom:'1px solid var(--border)',padding:isMobile?'6px 12px 8px':'8px 16px 10px',flexShrink:0}}>
        {/* Stage pills — hidden on mobile */}
        <div style={{display:isMobile?'none':'flex',alignItems:'center',justifyContent:'center',marginBottom:9}}>
          {STAGE_LABELS.map((s,i)=>(
            <div key={s} style={{display:'flex',alignItems:'center'}}>
              <div style={{display:'flex',alignItems:'center',gap:5,padding:'4px 10px',borderRadius:20,
                background: i===stageIdx?'var(--accent)': i<stageIdx?'rgba(90,173,142,0.12)':'transparent',
                transition:'all .3s'}}>
                <div style={{width:17,height:17,borderRadius:'50%',flexShrink:0,
                  background: i<stageIdx?'#5aad8e': i===stageIdx?'rgba(255,255,255,0.9)':'var(--nm-input-bg)',
                  color: i<stageIdx?'#fff': i===stageIdx?'var(--accent)':'var(--text-muted)',
                  display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:800}}>
                  {i<stageIdx?'✓':i+1}
                </div>
                <span style={{fontSize:11,fontWeight:i===stageIdx?700:400,whiteSpace:'nowrap',
                  color: i===stageIdx?'#fff': i<stageIdx?'var(--accent)':'var(--text-muted)'}}>
                  {s}
                </span>
              </div>
              {i<3 && <div style={{width:16,height:1.5,background:i<stageIdx?'var(--accent)':'var(--border)',flexShrink:0}}/>}
            </div>
          ))}
        </div>
        {/* Progress bar */}
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{flex:1,height:5,background:'var(--border)',borderRadius:3,overflow:'hidden'}}>
            <div style={{height:'100%',width:progress+'%',background:'linear-gradient(90deg,var(--accent2),var(--accent))',borderRadius:3,transition:'width .4s'}}/>
          </div>
          <span style={{color:'var(--accent)',fontWeight:700,fontSize:11,minWidth:32,textAlign:'right'}}>{pct}%</span>
        </div>
      </div>

      {/* ── BODY: step list + detail ── */}
      <div style={{flex:1,display:'flex',overflow:'hidden',minHeight:0,flexDirection:isMobile?'column':'row'}}>

        {/* SIDEBAR – vertical on desktop, horizontal strip on mobile */}
        {isMobile ? (
          /* Mobile: horizontal scrollable step bubbles */
          <div ref={sidebarRef} style={{display:'flex',overflowX:'auto',flexShrink:0,background:'var(--bg-sidebar)',borderBottom:'1px solid var(--border)',padding:'8px 10px',gap:6,WebkitOverflowScrolling:'touch'}}>
            {steps.map((s,i)=>{
              const done=i<step, active=i===step;
              const bgTimer=stepTimers[i], bgRunning=bgTimer?.running&&bgTimer.remaining>0;
              return (
                <div key={i} ref={el=>{stepRowRefs.current[i]=el;}} onClick={()=>setStep(i)}
                  style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3,flexShrink:0,cursor:'pointer',padding:'2px 4px'}}>
                  <div style={{width:32,height:32,borderRadius:'50%',flexShrink:0,
                    background:done?'#5aad8e':active?'var(--accent)':'var(--nm-input-bg)',
                    color:done||active?'#fff':'var(--text-muted)',
                    display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:800,
                    boxShadow:active?'0 0 0 3px rgba(90,173,142,0.35)':'var(--nm-raised-sm)',
                    outline:active?'2px solid var(--accent)':'none',outlineOffset:2,
                    transition:'all .15s'}}>
                    {done?'✓':i+1}
                  </div>
                  {s.timeMin&&<span style={{fontSize:8,color:bgRunning?'#ffd580':'var(--text-muted)',fontWeight:600,whiteSpace:'nowrap'}}>
                    {bgRunning?fmtTime(bgTimer.remaining):s.timeMin+'m'}
                  </span>}
                </div>
              );
            })}
          </div>
        ) : (
          /* Desktop: vertical sidebar */
          <div ref={sidebarRef} style={{width:190,flexShrink:0,borderRight:'1px solid var(--border)',overflowY:'auto',background:'var(--bg-sidebar)'}}>
            {steps.map((s,i)=>{
              const done=i<step, active=i===step;
              const bgTimer=stepTimers[i], bgRunning=bgTimer?.running&&bgTimer.remaining>0;
              return (
                <div key={i} ref={el=>{stepRowRefs.current[i]=el;}} onClick={()=>setStep(i)}
                  style={{display:'flex',alignItems:'flex-start',gap:9,padding:'10px 10px',
                    background:active?'rgba(58,125,94,0.13)':'transparent',
                    borderLeft:active?'3px solid var(--accent)':'3px solid transparent',
                    borderBottom:'1px solid var(--border)',cursor:'pointer',transition:'background .15s'}}>
                  <div style={{width:26,height:26,borderRadius:'50%',flexShrink:0,marginTop:1,
                    background:done?'#5aad8e':active?'var(--accent)':'var(--nm-input-bg)',
                    color:done||active?'#fff':'var(--text-muted)',
                    display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:800,
                    boxShadow:active?'0 0 0 3px rgba(90,173,142,0.28)':'var(--nm-raised-sm)'}}>
                    {done?'✓':i+1}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{color:active?'var(--accent)':done?'var(--text-muted)':'var(--text)',
                      fontSize:11,lineHeight:1.35,fontWeight:active?700:400,
                      overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',
                      textDecoration:done?'line-through':'none',textDecorationColor:'var(--text-muted)'}}>
                      {s.text}
                    </div>
                    <div style={{display:'flex',gap:5,marginTop:3,flexWrap:'wrap'}}>
                      {s.timeMin&&<span style={{fontSize:9,fontWeight:600,color:bgRunning?'#ffd580':'var(--text-muted)'}}>
                        {bgRunning?'⏱ '+fmtTime(bgTimer.remaining):'⏱ '+s.timeMin+'m'}
                      </span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* RIGHT – Current step detail */}
        <div style={{flex:1,overflowY:'auto',padding:isMobile?'12px 12px 100px':'16px 16px 100px'}}>

          {/* Step images */}
          {getStepImages(current).length > 0 && (
            <div style={{marginBottom:16}}>
              {getStepImages(current).length === 1
                ? <div style={{borderRadius:16,overflow:'hidden',boxShadow:'var(--nm-raised)',textAlign:'center',background:'var(--nm-input-bg)',maxHeight:260}}>
                    <img src={getStepImages(current)[0]} alt="" style={{maxWidth:'100%',maxHeight:260,width:'auto',height:'auto',display:'inline-block',verticalAlign:'bottom'}}/>
                  </div>
                : <div style={{display:'flex',gap:8,overflowX:'auto',paddingBottom:4}}>
                    {getStepImages(current).map((img,idx)=>(
                      <div key={idx} style={{borderRadius:12,overflow:'hidden',flexShrink:0,boxShadow:'var(--nm-raised-sm)',textAlign:'center',background:'var(--nm-input-bg)'}}>
                        <img src={img} alt="" style={{maxWidth:240,maxHeight:180,width:'auto',height:'auto',display:'inline-block',verticalAlign:'bottom'}}/>
                      </div>
                    ))}
                  </div>
              }
            </div>
          )}

          {/* Air fryer banner */}
          {afMode && (
            <div style={{background:'rgba(255,160,50,0.1)',border:'1px solid rgba(255,160,50,0.35)',borderRadius:14,padding:'10px 14px',marginBottom:14,display:'flex',alignItems:'flex-start',gap:10}}>
              <span style={{fontSize:20,flexShrink:0}}>🌬️</span>
              <div>
                <div style={{color:'#f5a623',fontWeight:700,fontSize:12,marginBottom:2}}>Air Fryer Mode</div>
                <div style={{color:'var(--text-sub)',fontSize:11,lineHeight:1.5}}>Temp −25°F/15°C · Time −25% · Preheat 3–5 min · Check 2–3 min early</div>
              </div>
            </div>
          )}

          {/* ── MAIN STEP CARD ── */}
          <div style={{background:'var(--bg-card)',boxShadow:'var(--nm-raised)',borderRadius:22,padding:isMobile?'16px 14px 18px':'22px 18px 24px',marginBottom:14,textAlign:'center'}}>
            <div style={{width:isMobile?42:54,height:isMobile?42:54,borderRadius:'50%',
              background:STEP_COLORS[step%STEP_COLORS.length],
              color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',
              fontWeight:800,fontSize:isMobile?18:24,margin:'0 auto 8px',
              boxShadow:'0 6px 20px rgba(0,0,0,0.2)'}}>
              {step+1}
            </div>
            <div style={{color:'var(--text-muted)',fontSize:11,letterSpacing:1.2,textTransform:'uppercase',marginBottom:14,fontWeight:600}}>
              Step {step+1} of {steps.length}
              {eatAtSchedule[step] && <span style={{color:'#5a8fd4',marginLeft:8,fontSize:10}}>▶ {eatAtSchedule[step].startLabel}</span>}
            </div>
            <p style={{color:'var(--text)',fontSize:isMobile?15:17,lineHeight:1.7,margin:0,fontFamily:"'Playfair Display',serif"}}>
              {afMode && afStep ? afStep.text : current.text}
            </p>
            {afMode && afStep?.changed && (
              <div style={{marginTop:10,padding:'5px 12px',background:'rgba(255,160,50,0.12)',borderRadius:8,display:'inline-block',fontSize:11,color:'#f5a623'}}>
                🌬️ Converted for air fryer
              </div>
            )}
          </div>

          {/* ── APPLIANCE CONTEXT CARDS ── */}

          {/* STOVE CARD */}
          {(stepAppliance==='stove'||(!stepAppliance&&heatHint)) && (() => {
            const ab = heatHint ? heatHint.bars : 2;
            const FLAMES = [
              null,
              {grad:'radial-gradient(circle at center,#ffb36b 0%,#ffb36b55 45%,transparent 70%)',scale:0.78,opacity:0.65,blur:8, glow:'0 0 18px #ffb36b55'},
              {grad:'radial-gradient(circle at center,#ff7a3c 0%,#ff7a3c66 45%,transparent 70%)',scale:1.0, opacity:0.85,blur:10,glow:'0 0 28px #ff7a3c77'},
              {grad:'radial-gradient(circle at center,#ff5500 0%,#ff7a3c 40%,transparent 70%)',  scale:1.1, opacity:0.92,blur:11,glow:'0 0 34px #ff550088'},
              {grad:'radial-gradient(circle at center,#a8d8ff 0%,#4da6ff 35%,transparent 68%)',  scale:1.2, opacity:1,   blur:13,glow:'0 0 42px #4da6ffaa'},
            ];
            const f = FLAMES[ab] || FLAMES[1];
            const isHigh = ab === 4;
            const heatColors = ['','#5a8fd4','#f5c842','#f5a623','#4da6ff'];
            const heatLabels = ['','Low','Medium','Med High','High'];
            const heatRanges = ['','100–140°C','150–180°C','180–210°C','210–230°C'];
            const fc = heatColors[ab];
            return (
              <>
                <style>{`
                  @keyframes burnerFlicker {
                    0%,100% { transform:scale(1.2); filter:blur(13px) brightness(1); }
                    33%     { transform:scale(1.28); filter:blur(15px) brightness(1.2); }
                    66%     { transform:scale(1.17); filter:blur(12px) brightness(0.95); }
                  }
                `}</style>
                <div style={{background:'var(--bg-card)',boxShadow:'var(--nm-raised)',borderRadius:20,padding:'16px 18px',marginBottom:14}}>
                  {/* Header */}
                  <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
                    <svg width="36" height="40" viewBox="0 0 36 40" fill="none">
                      <path d="M18 2C14 8 9 15 9 22C9 28.627 13.1 33 18 33C22.9 33 27 28.627 27 22C27 15 22 8 18 2Z" fill="url(#fg1n)"/>
                      <path d="M18 15C16 18 14 21 14 24C14 26.761 15.791 29 18 29C20.209 29 22 26.761 22 24C22 21 20 18 18 15Z" fill="url(#fg2n)"/>
                      <defs>
                        <linearGradient id="fg1n" x1="18" y1="2" x2="18" y2="33" gradientUnits="userSpaceOnUse">
                          <stop offset="0%" stopColor="#FFD580"/>
                          <stop offset="55%" stopColor="#F5A623"/>
                          <stop offset="100%" stopColor="#E05050"/>
                        </linearGradient>
                        <linearGradient id="fg2n" x1="18" y1="15" x2="18" y2="29" gradientUnits="userSpaceOnUse">
                          <stop offset="0%" stopColor="#FFFDE7" stopOpacity="0.95"/>
                          <stop offset="100%" stopColor="#FFD580" stopOpacity="0.5"/>
                        </linearGradient>
                      </defs>
                    </svg>
                    <div style={{flex:1}}>
                      <div style={{color:'var(--text)',fontWeight:800,fontSize:16,fontFamily:"'Playfair Display',serif"}}>Stove &amp; Flame</div>
                      <div style={{color:'var(--text-muted)',fontSize:11}}>Let's Cook</div>
                    </div>
                    {/* Read-only badge */}
                    <div style={{background:fc+'22',border:'1px solid '+fc+'66',borderRadius:20,padding:'4px 10px',flexShrink:0}}>
                      <span style={{color:fc,fontWeight:800,fontSize:12}}>{heatLabels[ab]}</span>
                    </div>
                  </div>

                  {/* NEOMORPHIC BURNER RING */}
                  <div style={{display:'flex',justifyContent:'center',marginBottom:16}}>
                    {(()=>{
                      const sz = isMobile?112:140;
                      const half = sz/2;
                      const segH = isMobile?14:18;
                      const segR = half - segH - 4;
                      return (
                        <div style={{
                          width:sz,height:sz,borderRadius:'50%',position:'relative',
                          background:'var(--bg)',
                          boxShadow: f.glow+', 8px 8px 18px rgba(0,0,0,0.18), -8px -8px 18px rgba(255,255,255,0.65)',
                          transition:'box-shadow 0.5s ease'
                        }}>
                          {Array.from({length:20}).map((_,i)=>(
                            <div key={i} style={{
                              position:'absolute',
                              width:5,height:segH,
                              top:0,left:'50%',marginLeft:-2.5,
                              transformOrigin:`50% ${half}px`,
                              transform:`rotate(${i*18}deg) translateY(-${segR}px)`,
                              borderRadius:'50%',
                              background:fc,
                              opacity:f.opacity * (0.55 + 0.45*Math.abs(Math.sin(i*0.8+ab))),
                              transition:'opacity .4s, background .4s',
                              animation:isHigh?`burnerFlicker ${0.15+i*0.01}s ${i*0.008}s infinite`:'none'
                            }}/>
                          ))}
                          <div style={{
                            position:'absolute',inset:sz*0.22,borderRadius:'50%',
                            background:`radial-gradient(circle,${fc}44 0%,transparent 70%)`,
                            filter:'blur(6px)',
                            transition:'background .4s'
                          }}/>
                          <div style={{position:'absolute',inset:8,borderRadius:'50%',
                            boxShadow:'inset 4px 4px 10px rgba(0,0,0,0.22), inset -4px -4px 10px rgba(255,255,255,0.14)',
                            background:'transparent'}}/>
                          <div style={{position:'absolute',inset:'30%',borderRadius:'50%',
                            boxShadow:'inset 3px 3px 7px rgba(0,0,0,0.28), inset -3px -3px 7px rgba(255,255,255,0.12)',
                            background:'transparent'}}/>
                          <div style={{position:'absolute',top:'50%',left:'50%',width:12,height:12,borderRadius:'50%',
                            transform:'translate(-50%,-50%)',background:'var(--bg-sidebar)',
                            boxShadow:'inset 1px 1px 3px rgba(0,0,0,0.35), 0 1px 3px rgba(0,0,0,0.2)'}}/>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Read-only heat level track */}
                  <div style={{padding:'0 4px'}}>
                    <div style={{display:'flex',gap:5,marginBottom:6}}>
                      {[1,2,3,4].map(lvl=>(
                        <div key={lvl} style={{flex:1,height:6,borderRadius:3,transition:'background .4s',
                          background:lvl<=ab?fc:'var(--border)'}}/>
                      ))}
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <span style={{fontSize:10,color:'var(--text-muted)'}}>Ideal range</span>
                      <span style={{fontSize:11,fontWeight:700,color:fc}}>{heatRanges[ab]}</span>
                    </div>
                  </div>
                </div>
              </>
            );
          })()}

          {/* OVEN TEMPERATURE CARD */}
          {stepAppliance==='oven' && (
            <div style={{background:'var(--bg-card)',boxShadow:'var(--nm-raised)',borderRadius:20,padding:'16px 18px',marginBottom:14}}>
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
                <svg width="32" height="36" viewBox="0 0 32 36" fill="none">
                  <rect x="10" y="2" width="12" height="22" rx="6" stroke="#f5a623" strokeWidth="2" fill="none"/>
                  <rect x="13" y="5" width="6" height="14" rx="3" fill="#f5a623" opacity="0.35"/>
                  <rect x="13" y="13" width="6" height="6" rx="3" fill="#f5a623" opacity="0.8"/>
                  <circle cx="16" cy="29" r="5" fill="#f5a623"/>
                  <circle cx="16" cy="29" r="2.5" fill="#fff" opacity="0.5"/>
                  <line x1="22" y1="8" x2="25" y2="8" stroke="#f5a623" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="22" y1="13" x2="24" y2="13" stroke="#f5a623" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="22" y1="18" x2="25" y2="18" stroke="#f5a623" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <div>
                  <div style={{color:'var(--text)',fontWeight:800,fontSize:16,fontFamily:"'Playfair Display',serif"}}>Temperature Control</div>
                  <div style={{color:'var(--text-muted)',fontSize:11}}>Oven</div>
                </div>
              </div>
              {(()=>{
                const CIRC = 283;
                const tc = cookCardMode.tempC != null ? cookCardMode.tempC : (stepTemp ? stepTemp.c : 180);
                const tf = Math.round(tc*9/5+32);
                const tlabel = tc>=230?'High Heat':tc>=190?'Medium High':tc>=160?'Medium':'Low / Simmer';
                const tcolor = tc>=230?'#e05050':tc>=190?'#f5a623':tc>=160?'#ffd580':'#5a8fd4';
                const arcFill = ((tc-100)/180)*CIRC;
                const offset = CIRC - arcFill;
                return (
                  <div style={{textAlign:'center'}}>
                    {/* SVG arc dial */}
                    <div style={{position:'relative',width:120,height:120,margin:'0 auto 12px'}}>
                      <svg width="120" height="120" style={{transform:'rotate(-90deg)'}}>
                        <circle cx="60" cy="60" r="45" strokeWidth="9" fill="none" stroke="var(--border)"/>
                        <circle cx="60" cy="60" r="45" strokeWidth="9" fill="none"
                          stroke={tcolor} strokeLinecap="round"
                          strokeDasharray={CIRC} strokeDashoffset={offset}
                          style={{transition:'stroke-dashoffset .4s ease,stroke .4s'}}/>
                      </svg>
                      <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',textAlign:'center',lineHeight:1.2}}>
                        <div style={{color:tcolor,fontWeight:900,fontSize:20,fontFamily:'monospace',transition:'color .4s'}}>{tc}°C</div>
                        <div style={{color:'var(--text-muted)',fontSize:10}}>{tf}°F</div>
                      </div>
                    </div>
                    <div style={{color:tcolor,fontWeight:700,fontSize:11,marginBottom:12,textTransform:'uppercase',letterSpacing:.8,transition:'color .4s'}}>{tlabel}</div>
                    {/* Slider */}
                    <input type="range" min="100" max="280" step="5" value={tc}
                      className="nm-range nm-range-orange"
                      onChange={e=>setCookCardMode(m=>({...m,tempC:parseInt(e.target.value)}))}
                      style={{background:`linear-gradient(to right,${tcolor} 0%,${tcolor} ${(tc-100)/180*100}%,var(--border) ${(tc-100)/180*100}%,var(--border) 100%)`}}
                    />
                    <div style={{display:'flex',justifyContent:'space-between',marginTop:5,fontSize:9,color:'var(--text-muted)'}}>
                      <span>100°C</span><span>190°C</span><span>280°C</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* CHOPPING BOARD CARD */}
          {stepTechniques.length>0&&!stepAppliance&&!heatHint&&(
            <div style={{background:'var(--bg-card)',boxShadow:'var(--nm-raised)',borderRadius:20,padding:'16px 18px',marginBottom:14}}>
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:14}}>
                <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
                  <path d="M7 27L25 5L31 11L15 31Z" fill="#888" opacity="0.75"/>
                  <path d="M7 27L3 31" stroke="#666" strokeWidth="3" strokeLinecap="round"/>
                  <path d="M25 5L29 1L33 5L31 11Z" fill="#bbb"/>
                  <path d="M12 22L10 24" stroke="#aaa" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <div>
                  <div style={{color:'var(--text)',fontWeight:800,fontSize:16,fontFamily:"'Playfair Display',serif"}}>Chopping Board</div>
                  <div style={{color:'var(--text-muted)',fontSize:11}}>Prep Technique</div>
                </div>
              </div>
              <div style={{display:'flex',flexWrap:'wrap',gap:7}}>
                {['Dice','Slice','Julienne','Chop','Mince','Grate'].map(tech=>{
                  const active=stepTechniques.includes(tech);
                  return (<div key={tech} style={{padding:'7px 14px',borderRadius:20,fontSize:12,fontWeight:700,
                    background:active?'rgba(90,173,142,0.2)':'var(--nm-input-bg)',
                    border:active?'1.5px solid rgba(90,173,142,0.6)':'1.5px solid transparent',
                    color:active?'#5aad8e':'var(--text-muted)',
                    boxShadow:active?'0 0 10px rgba(90,173,142,0.3)':'none'}}>{tech}</div>);
                })}
              </div>
            </div>
          )}

          {/* BLENDER CARD */}
          {stepAppliance==='blender'&&(
            <div style={{background:'var(--bg-card)',boxShadow:'var(--nm-raised)',borderRadius:20,padding:'16px 18px',marginBottom:14}}>
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:14}}>
                <svg width="30" height="36" viewBox="0 0 30 36" fill="none">
                  <path d="M5 7H25L22 26H8Z" fill="#5a8fd4" opacity="0.7"/>
                  <rect x="5" y="4" width="20" height="4" rx="2" fill="#5a8fd4"/>
                  <rect x="8" y="26" width="14" height="4" rx="2" fill="#5a8fd4" opacity="0.8"/>
                  <rect x="10" y="30" width="10" height="4" rx="2" fill="#5a8fd4" opacity="0.6"/>
                  <line x1="10" y1="13" x2="14" y2="18" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
                  <line x1="15" y1="11" x2="15" y2="17" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
                </svg>
                <div>
                  <div style={{color:'var(--text)',fontWeight:800,fontSize:16,fontFamily:"'Playfair Display',serif"}}>Blender</div>
                  <div style={{color:'var(--text-muted)',fontSize:11}}>Speed Setting</div>
                </div>
              </div>
              {(()=>{
                const spd = cookCardMode.blendSpeed != null ? cookCardMode.blendSpeed : 5;
                const spLabel = spd===0?'Off':spd<=3?'Low':spd<=6?'Medium':spd<=9?'High':'Pulse/Max';
                return (
                  <div>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:8}}>
                      <span style={{color:'var(--text)',fontWeight:700,fontSize:14}}>Speed: {spd}</span>
                      <span style={{color:'#5a8fd4',fontWeight:700,fontSize:11}}>{spLabel}</span>
                    </div>
                    <input type="range" min="0" max="10" step="1" value={spd}
                      className="nm-range"
                      onChange={e=>setCookCardMode(m=>({...m,blendSpeed:parseInt(e.target.value)}))}
                      style={{background:`linear-gradient(to right,#5a8fd4 0%,#5a8fd4 ${spd/10*100}%,var(--border) ${spd/10*100}%,var(--border) 100%)`}}
                    />
                    <div style={{display:'flex',justifyContent:'space-between',marginTop:5,fontSize:9,color:'var(--text-muted)'}}>
                      <span>Off</span><span>Low</span><span>Med</span><span>High</span><span>Max</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* MICROWAVE CARD */}
          {stepAppliance==='microwave'&&(
            <div style={{background:'var(--bg-card)',boxShadow:'var(--nm-raised)',borderRadius:20,padding:'16px 18px',marginBottom:14}}>
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:14}}>
                <svg width="38" height="30" viewBox="0 0 38 30" fill="none">
                  <rect x="1" y="2" width="36" height="26" rx="4" stroke="#888" strokeWidth="2" fill="none"/>
                  <rect x="4" y="5" width="22" height="20" rx="2" stroke="#888" strokeWidth="1.5" fill="none"/>
                  <circle cx="32" cy="11" r="2.5" fill="#888" opacity="0.5"/>
                  <circle cx="32" cy="19" r="2.5" fill="#5aad8e" opacity="0.7"/>
                  <path d="M9 13C9 13 11 12 11 15C11 18 9 17 9 17" stroke="#888" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.6"/>
                  <path d="M14 13C14 13 16 12 16 15C16 18 14 17 14 17" stroke="#888" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.6"/>
                  <path d="M19 13C19 13 21 12 21 15C21 18 19 17 19 17" stroke="#888" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.6"/>
                </svg>
                <div>
                  <div style={{color:'var(--text)',fontWeight:800,fontSize:16,fontFamily:"'Playfair Display',serif"}}>Microwave</div>
                  <div style={{color:'var(--text-muted)',fontSize:11}}>Power Level</div>
                </div>
              </div>
              {(()=>{
                const pw = cookCardMode.microPower!=null?cookCardMode.microPower:60;
                const pwColor = pw>=80?'#e05050':pw>=50?'#f5a623':'#5a8fd4';
                return (
                  <div>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:8}}>
                      <span style={{color:'var(--text)',fontWeight:700,fontSize:14}}>Power: {pw}%</span>
                      <span style={{color:pwColor,fontWeight:700,fontSize:11}}>{pw>=80?'High':pw>=50?'Medium':'Low'}</span>
                    </div>
                    <input type="range" min="0" max="100" step="10" value={pw}
                      className="nm-range"
                      onChange={e=>setCookCardMode(m=>({...m,microPower:parseInt(e.target.value)}))}
                      style={{background:`linear-gradient(to right,${pwColor} 0%,${pwColor} ${pw}%,var(--border) ${pw}%,var(--border) 100%)`}}
                    />
                    <div style={{display:'flex',justifyContent:'space-between',marginTop:5,fontSize:9,color:'var(--text-muted)'}}>
                      <span>0%</span><span>50%</span><span>100%</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* AIR FRYER CARD */}
          {stepAppliance==='airfryer'&&!afMode&&(
            <div style={{background:'rgba(255,160,50,0.08)',border:'1px solid rgba(255,160,50,0.3)',borderRadius:20,padding:'16px 18px',marginBottom:14}}>
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:14}}>
                <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                  <rect x="4" y="8" width="28" height="22" rx="5" stroke="#f5a623" strokeWidth="2" fill="none"/>
                  <circle cx="18" cy="19" r="7" stroke="#f5a623" strokeWidth="1.5" fill="none"/>
                  <circle cx="18" cy="19" r="3" fill="#f5a623" opacity="0.5"/>
                  <path d="M14 5C14 5 15 3 18 3C21 3 22 5 22 5" stroke="#f5a623" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                  <line x1="8" y1="14" x2="11" y2="14" stroke="#f5a623" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="8" y1="19" x2="11" y2="19" stroke="#f5a623" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="8" y1="24" x2="11" y2="24" stroke="#f5a623" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <div>
                  <div style={{color:'#f5a623',fontWeight:800,fontSize:16,fontFamily:"'Playfair Display',serif"}}>Air Fryer</div>
                  <div style={{color:'var(--text-muted)',fontSize:11}}>Cook Mode</div>
                </div>
                <button onClick={()=>setAfMode(true)}
                  style={{marginLeft:'auto',...GB,padding:'5px 10px',fontSize:11,color:'#f5a623',border:'1px solid rgba(255,160,50,0.4)',fontWeight:700}}>
                  Switch to AF
                </button>
              </div>
              <div style={{display:'flex',gap:7,marginBottom:14}}>
                {['Bake','Broil','Convection'].map(m=>{
                  const isActive=(cookCardMode.airfryer||'Convection')===m;
                  return (<button key={m} onClick={()=>setCookCardMode(cm=>({...cm,airfryer:m}))}
                    style={{flex:1,border:isActive?'1.5px solid rgba(255,160,50,0.6)':'1.5px solid transparent',borderRadius:14,padding:'10px 4px',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:700,transition:'all .2s',
                      background:isActive?'rgba(255,160,50,0.22)':'var(--nm-input-bg)',
                      color:isActive?'#f5a623':'var(--text-muted)',
                      boxShadow:isActive?'0 0 12px rgba(255,160,50,0.4)':'none'}}>{m}</button>);
                })}
              </div>
              {(()=>{
                const aft = cookCardMode.afTemp!=null?cookCardMode.afTemp:180;
                return (
                  <div>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:7}}>
                      <span style={{color:'var(--text)',fontWeight:700,fontSize:14}}>{aft}°C</span>
                      <span style={{color:'#f5a623',fontWeight:700,fontSize:11}}>{Math.round(aft*9/5+32)}°F</span>
                    </div>
                    <input type="range" min="50" max="200" step="5" value={aft}
                      className="nm-range nm-range-orange"
                      onChange={e=>setCookCardMode(m=>({...m,afTemp:parseInt(e.target.value)}))}
                      style={{background:`linear-gradient(to right,#f5a623 0%,#f5a623 ${(aft-50)/150*100}%,var(--border) ${(aft-50)/150*100}%,var(--border) 100%)`}}
                    />
                    <div style={{display:'flex',justifyContent:'space-between',marginTop:5,fontSize:9,color:'var(--text-muted)'}}>
                      <span>50°C</span><span>125°C</span><span>200°C</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* RICE COOKER CARD */}
          {stepAppliance==='ricecooker'&&(
            <div style={{background:'var(--bg-card)',boxShadow:'var(--nm-raised)',borderRadius:20,padding:'16px 18px',marginBottom:14}}>
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:14}}>
                <svg width="36" height="34" viewBox="0 0 36 34" fill="none">
                  <path d="M4 18C4 11 10.268 7 18 7C25.732 7 32 11 32 18V26H4V18Z" fill="#5aad8e" opacity="0.65"/>
                  <ellipse cx="18" cy="18" rx="14" ry="5" fill="#5aad8e" opacity="0.4"/>
                  <rect x="3" y="26" width="30" height="6" rx="3" fill="#5aad8e" opacity="0.5"/>
                  <path d="M13 7C13 4 15 2 18 2C21 2 23 4 23 7" stroke="#5aad8e" strokeWidth="2" fill="none" strokeLinecap="round"/>
                  <circle cx="18" cy="2" r="1.5" fill="#5aad8e"/>
                </svg>
                <div>
                  <div style={{color:'var(--text)',fontWeight:800,fontSize:16,fontFamily:"'Playfair Display',serif"}}>Rice Cooker</div>
                  <div style={{color:'var(--text-muted)',fontSize:11}}>Cook Mode</div>
                </div>
              </div>
              <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                {['White Rice','Brown Rice','Porridge','Timer'].map(m=>{
                  const isActive=(cookCardMode.ricecooker||'White Rice')===m;
                  return (<button key={m} onClick={()=>setCookCardMode(cm=>({...cm,ricecooker:m}))}
                    style={{borderRadius:20,padding:'8px 14px',cursor:'pointer',fontFamily:'inherit',fontSize:11,fontWeight:700,transition:'all .2s',
                      border:isActive?'1.5px solid rgba(90,173,142,0.6)':'1.5px solid transparent',
                      background:isActive?'rgba(90,173,142,0.2)':'var(--nm-input-bg)',
                      color:isActive?'#5aad8e':'var(--text-muted)',
                      boxShadow:isActive?'0 0 10px rgba(90,173,142,0.3)':'none'}}>{m}</button>);
                })}
              </div>
            </div>
          )}

          {/* INSTANT POT CARD */}
          {stepAppliance==='instantpot'&&(
            <div style={{background:'var(--bg-card)',boxShadow:'var(--nm-raised)',borderRadius:20,padding:'16px 18px',marginBottom:14}}>
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:14}}>
                <svg width="34" height="36" viewBox="0 0 34 36" fill="none">
                  <path d="M5 14C5 9 10.5 6 17 6C23.5 6 29 9 29 14V28H5V14Z" fill="#e05050" opacity="0.65"/>
                  <ellipse cx="17" cy="14" rx="12" ry="5" fill="#e05050" opacity="0.4"/>
                  <rect x="4" y="28" width="26" height="5" rx="2.5" fill="#e05050" opacity="0.45"/>
                  <path d="M13 6C13 3.5 14.5 2 17 2C19.5 2 21 3.5 21 6" stroke="#e05050" strokeWidth="2" fill="none" strokeLinecap="round"/>
                  <circle cx="17" cy="14" r="4" fill="#fff" opacity="0.2"/>
                  <path d="M15 13L17 11L19 13L17 15Z" fill="#fff" opacity="0.6"/>
                </svg>
                <div>
                  <div style={{color:'var(--text)',fontWeight:800,fontSize:16,fontFamily:"'Playfair Display',serif"}}>Instant Pot</div>
                  <div style={{color:'var(--text-muted)',fontSize:11}}>Pressure Setting</div>
                </div>
              </div>
              {/* Pressure toggle */}
              {(()=>{
                const pressureOn = cookCardMode.pressureOn !== false;
                return (
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,padding:'10px 14px',
                    background:pressureOn?'rgba(224,80,80,0.1)':'var(--nm-input-bg)',borderRadius:14,transition:'background .3s'}}>
                    <div>
                      <div style={{color:pressureOn?'#e05050':'var(--text-muted)',fontWeight:700,fontSize:13,transition:'color .3s'}}>Pressure</div>
                      <div style={{color:'var(--text-muted)',fontSize:10}}>{pressureOn?'High pressure active':'Pressure off'}</div>
                    </div>
                    <div onClick={()=>setCookCardMode(m=>({...m,pressureOn:!(m.pressureOn!==false)}))}
                      style={{width:48,height:26,borderRadius:13,position:'relative',cursor:'pointer',transition:'background .3s',
                        background:pressureOn?'#e05050':'var(--border)',
                        boxShadow:'inset 1px 1px 4px rgba(0,0,0,0.2)'}}>
                      <div style={{position:'absolute',top:3,width:20,height:20,borderRadius:'50%',
                        background:'#fff',boxShadow:'0 2px 5px rgba(0,0,0,0.3)',
                        left:pressureOn?25:3,transition:'left .3s'}}/>
                    </div>
                  </div>
                );
              })()}
              <div style={{display:'flex',gap:7,marginBottom:10}}>
                {['Pressure Cook','Slow Cook','Sauté'].map(m=>{
                  const isActive=(cookCardMode.instantpot_mode||'Pressure Cook')===m;
                  return (<button key={m} onClick={()=>setCookCardMode(cm=>({...cm,instantpot_mode:m}))}
                    style={{flex:1,border:isActive?'1.5px solid rgba(224,80,80,0.6)':'1.5px solid transparent',borderRadius:14,padding:'10px 4px',cursor:'pointer',fontFamily:'inherit',fontSize:10,fontWeight:700,transition:'all .2s',
                      background:isActive?'rgba(224,80,80,0.2)':'var(--nm-input-bg)',
                      color:isActive?'#e05050':'var(--text-muted)',
                      boxShadow:isActive?'0 0 10px rgba(224,80,80,0.3)':'none'}}>{m}</button>);
                })}
              </div>
              <div style={{display:'flex',gap:10,marginBottom:14}}>
                {['Low','High'].map(lv=>{
                  const isActive=(cookCardMode.instantpot_level||'High')===lv;
                  return (<button key={lv} onClick={()=>setCookCardMode(cm=>({...cm,instantpot_level:lv}))}
                    style={{flex:1,border:isActive?'1.5px solid rgba(245,166,35,0.6)':'1.5px solid transparent',borderRadius:14,padding:'10px 4px',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:700,transition:'all .2s',
                      background:isActive?'rgba(245,166,35,0.2)':'var(--nm-input-bg)',
                      color:isActive?'#f5a623':'var(--text-muted)',
                      boxShadow:isActive?'0 0 10px rgba(245,166,35,0.3)':'none'}}>{lv}</button>);
                })}
              </div>
              {(()=>{
                const pt = cookCardMode.pressureTime!=null?cookCardMode.pressureTime:15;
                return (
                  <div>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:7}}>
                      <span style={{color:'var(--text)',fontWeight:700,fontSize:13}}>Cook Time</span>
                      <span style={{color:'#f5a623',fontWeight:800,fontSize:15}}>{pt} min</span>
                    </div>
                    <input type="range" min="0" max="60" step="5" value={pt}
                      className="nm-range nm-range-orange"
                      onChange={e=>setCookCardMode(m=>({...m,pressureTime:parseInt(e.target.value)}))}
                      style={{background:`linear-gradient(to right,#f5a623 0%,#f5a623 ${pt/60*100}%,var(--border) ${pt/60*100}%,var(--border) 100%)`}}
                    />
                    <div style={{display:'flex',justifyContent:'space-between',marginTop:5,fontSize:9,color:'var(--text-muted)'}}>
                      <span>0m</span><span>30m</span><span>60m</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Background timers strip */}
          {Object.entries(stepTimers).filter(([k,tmr])=>parseInt(k)!==step&&tmr.running&&tmr.remaining>0).length>0 && (
            <div style={{background:'rgba(255,213,128,0.08)',border:'1px solid rgba(255,213,128,0.25)',borderRadius:10,padding:'8px 12px',marginBottom:12,display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
              <span style={{color:'#ffd580',fontSize:11,fontWeight:700,flexShrink:0}}>⏱ Also running:</span>
              {Object.entries(stepTimers).filter(([k,tmr])=>parseInt(k)!==step&&tmr.running&&tmr.remaining>0).map(([k,tmr])=>(
                <span key={k} onClick={()=>setStep(parseInt(k))}
                  style={{background:'rgba(255,213,128,0.15)',borderRadius:20,padding:'2px 10px',fontSize:12,color:'#ffd580',fontWeight:700,cursor:'pointer'}}>
                  Step {parseInt(k)+1} · {fmtTime(tmr.remaining)}
                </span>
              ))}
            </div>
          )}

          {/* ── TIMER CARD ── */}
          {cmTimeMin ? (
            <div style={{background:'var(--bg-card)',boxShadow:'var(--nm-raised)',borderRadius:20,padding:'18px 20px 20px',marginBottom:14}}>
              {/* Timer header */}
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
                <div style={{width:36,height:36,borderRadius:10,background:'rgba(90,173,142,0.15)',border:'1.5px solid rgba(90,173,142,0.3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>⏱</div>
                <div>
                  <div style={{color:'var(--text)',fontWeight:700,fontSize:13}}>{t('cook.timerLabel',language)}</div>
                  <div style={{color:'var(--text-muted)',fontSize:11}}>
                    {cmTimeMin} min
                    {afMode&&afStep?.timeMin&&afStep.timeMin!==current.timeMin && <span style={{color:'#f5a623',marginLeft:5}}>🌬️ was {current.timeMin}m</span>}
                  </div>
                </div>
                {eatAtSchedule[step] && <span style={{marginLeft:'auto',color:'#5a8fd4',fontSize:11,fontWeight:700}}>▶ {eatAtSchedule[step].startLabel}</span>}
              </div>
              {/* Big countdown */}
              <div style={{textAlign:'center',fontFamily:'monospace',fontWeight:800,lineHeight:1,marginBottom:14,
                fontSize:isMobile?44:60,letterSpacing:isMobile?2:3,
                color: cmDone?'#5aad8e': cmRunning?'var(--accent)':'var(--text)',
                textShadow: cmRunning?'0 0 32px rgba(90,173,142,0.45)':'none',
                transition:'color .3s'}}>
                {fmtTime(cmTimer.remaining)}
              </div>
              {/* Depletion bar */}
              <div style={{height:5,background:'var(--border)',borderRadius:3,overflow:'hidden',marginBottom:16}}>
                <div style={{height:'100%',borderRadius:3,transition:'width .5s',
                  width: cmTimeMin ? ((1 - cmTimer.remaining/(cmTimeMin*60))*100)+'%' : '0%',
                  background: cmDone?'#5aad8e':'linear-gradient(90deg,var(--accent2),var(--accent))'}}/>
              </div>
              {/* Controls */}
              <div style={{display:'flex',gap:10}}>
                <button onClick={()=>{unlockAudio();setStepTimers(t=>({...t,[step]:{...t[step]||{remaining:cmTimeMin*60},running:!cmRunning}}));}}
                  style={{flex:2,background:cmRunning?'rgba(200,60,60,0.15)':'linear-gradient(135deg,var(--accent2),var(--accent))',
                    border:'none',borderRadius:14,color:cmRunning?'#f08080':'#fff',
                    padding:'13px',fontWeight:800,fontSize:16,cursor:'pointer',fontFamily:'inherit',
                    boxShadow:cmRunning?'none':'var(--nm-raised-sm)'}}>
                  {cmDone ? '✓ '+t('cook.doneTimer',language) : cmRunning ? '⏸ '+t('cook.pauseTimer',language) : '▶ '+t('cook.startTimer',language)}
                </button>
                <button onClick={()=>setStepTimers(t=>({...t,[step]:{remaining:cmTimeMin*60,running:false}}))}
                  style={{...GB,padding:'13px 16px',fontSize:18}}>↺</button>
              </div>
              {/* Alarm sounds */}
              <div style={{marginTop:14,paddingTop:12,borderTop:'1px solid var(--border)'}}>
                <div style={{color:'var(--text-muted)',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:.6,marginBottom:8,textAlign:'center'}}>🔊 {t('cook.alarmSound',language)}</div>
                <div style={{display:'flex',gap:5,flexWrap:'wrap',justifyContent:'center'}}>
                  {ALARM_SOUNDS.map(s=>(
                    <button key={s.key} onClick={()=>{setAlarmSound(s.key);if(s.key!=='none')playAlarmSound(s.key);}}
                      style={{...GB,padding:'5px 10px',fontSize:11,borderRadius:20,
                        background:alarmSound===s.key?'rgba(90,173,142,0.2)':'var(--nm-input-bg)',
                        border:alarmSound===s.key?'1px solid rgba(90,173,142,0.5)':'1px solid transparent',
                        color:alarmSound===s.key?'#5aad8e':'var(--text-muted)',fontWeight:alarmSound===s.key?700:400}}>
                      {s.emoji} {s.label}
                    </button>
                  ))}
                </div>
                <div style={{color:'var(--text-muted)',fontSize:10,marginTop:5,textAlign:'center'}}>{t('cook.alarmHint',language)}</div>
              </div>
            </div>
          ) : null}

          {/* ── INGREDIENTS FOR THIS STEP ── */}
          {stepIngredients.length > 0 && (
            <div style={{marginBottom:14}}>
              <div style={{color:'var(--text-sub)',fontSize:11,fontWeight:700,marginBottom:9,textTransform:'uppercase',letterSpacing:.8}}>🥗 {t('cook.ingForStep',language)}</div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                {stepIngredients.map((ing,i)=>(
                  <div key={i} style={{display:'flex',alignItems:'center',gap:7,background:'var(--bg-card)',boxShadow:'var(--nm-raised-sm)',borderRadius:10,padding:'6px 10px'}}>
                    {ing.image
                      ? <img src={ing.image} alt={ing.name} style={{width:28,height:28,borderRadius:6,objectFit:'cover'}}/>
                      : <span style={{fontSize:18}}>{getItemEmoji(ing.name)}</span>
                    }
                    <div>
                      <div style={{color:'var(--text)',fontSize:12,fontWeight:600}}>{ing.name}</div>
                      <div style={{color:'var(--accent)',fontSize:11}}>{ing.amount} {ing.unit}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All-ingredients strip */}
          <div>
            <div style={{color:'var(--text-muted)',fontSize:11,marginBottom:6}}>{t('cook.allIngStrip',language)}</div>
            <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
              {(recipe.ingredients||[]).map((ing,i)=>{
                const used = stepIngredients.some(si=>si.name===ing.name);
                return (
                  <span key={i} style={{background:used?'rgba(90,173,142,0.2)':'var(--nm-input-bg)',
                    border:used?'1px solid rgba(90,173,142,0.4)':'1px solid transparent',
                    borderRadius:20,padding:'3px 10px',fontSize:11,color:used?'#5aad8e':'var(--text-muted)'}}>
                    {getItemEmoji(ing.name)} {ing.name}
                  </span>
                );
              })}
            </div>
          </div>

        </div>{/* end right panel */}
      </div>{/* end body */}

      {/* ── BOTTOM NAVIGATION ── */}
      <div style={{flexShrink:0,padding:'11px 14px',background:'var(--bg-sidebar)',borderTop:'1px solid var(--border)',display:'flex',alignItems:'center',gap:10}}>
        <button onClick={()=>setStep(s=>Math.max(0,s-1))} disabled={step===0}
          style={{...GB,flex:1,padding:'12px',fontSize:14,opacity:step===0?.3:1}}>
          ← {t('cook.back',language)}
        </button>
        <div style={{textAlign:'center',minWidth:52,flexShrink:0}}>
          <div style={{color:'var(--accent)',fontWeight:800,fontSize:14,lineHeight:1}}>{step+1}/{steps.length}</div>
          <div style={{color:'var(--text-muted)',fontSize:9,marginTop:2,textTransform:'uppercase',letterSpacing:.5}}>steps</div>
        </div>
        {step < steps.length-1
          ? <button onClick={()=>setStep(s=>s+1)}
              style={{flex:2,background:'linear-gradient(135deg,var(--accent2),var(--accent))',border:'none',borderRadius:12,color:'#fff',padding:'12px',fontWeight:800,fontSize:15,cursor:'pointer',fontFamily:'inherit'}}>
              {t('cook.nextStep',language)} →
            </button>
          : <button onClick={()=>{ onMarkCooked?.(recipe); onClose(); }}
              style={{flex:2,background:'linear-gradient(135deg,#2d7a40,#6dbe6a)',border:'none',borderRadius:12,color:'#fff',padding:'12px',fontWeight:800,fontSize:15,cursor:'pointer',fontFamily:'inherit'}}>
              🎉 {t('cook.finished',language)}
            </button>
        }
      </div>

    </div>
  );
}

// ─── PHOTO GALLERY ───────────────────────────────────────────────────────────
function PhotoGallery({recipes, onView, language='en'}) {
  const [filter, setFilter] = useState("all");
  const withPhotos = recipes.filter(r => r.image);
  const displayed = filter==="all" ? withPhotos : withPhotos.filter(r=>r.category===filter);

  return (
    <div>
      <h2 style={{color:"var(--text)",fontFamily:"'Playfair Display',serif",marginBottom:4}}>{t('gallery.title',language)}</h2>
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
          <div style={{fontSize:14,marginBottom:6}}>{t('gallery.empty',language)}</div>
          <div style={{fontSize:12}}>{t('gallery.emptyHint',language)}</div>
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
function SupplementTracker({supplements, setSupplements, language='en'}) {
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
  const TIME_LABELS = {morning:t('supp.morning',language),afternoon:t('supp.afternoon',language),evening:t('supp.evening',language),"with meals":t('supp.withMeals',language)};
  const TIME_COLORS = {morning:"#ffd580",afternoon:"#d4875a",evening:"#9b5aad","with meals":"#5aad8e"};
  const TIME_ICONS = {morning:"🌅",afternoon:"☀️",evening:"🌙","with meals":"🍽️"};

  const byTime = TIMES.map(tm=>({time:tm,items:supplements.filter(s=>s.time===tm)})).filter(g=>g.items.length>0);
  const doneToday = supplements.filter(s=>(s.log||[]).includes(today)).length;

  return (
    <div>
      <h2 style={{color:"var(--text)",fontFamily:"'Playfair Display',serif",marginBottom:4}}>{t('supp.title',language)}</h2>
      <p style={{color:"var(--text-sub)",fontSize:13,marginBottom:18}}>{t('supp.takenToday',language,{done:String(doneToday),total:String(supplements.length)})}</p>

      {/* Progress bar */}
      {supplements.length>0 && (
        <div style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised)",borderRadius:12,padding:"12px 16px",marginBottom:18}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:6}}>
            <span style={{color:"var(--text-sub)"}}>{t('supp.progress',language)}</span>
            <span style={{color:"var(--accent)",fontWeight:700}}>{doneToday}/{supplements.length}</span>
          </div>
          <div style={{height:8,background:"var(--nm-input-bg)",borderRadius:4,boxShadow:"var(--nm-inset)"}}>
            <div style={{height:"100%",width:(supplements.length?doneToday/supplements.length*100:0)+"%",background:"var(--accent)",borderRadius:4,transition:"width .4s"}}/>
          </div>
        </div>
      )}

      {/* Add supplement */}
      <div style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised)",borderRadius:14,padding:"14px 16px",marginBottom:20}}>
        <div style={{color:"var(--text-sub)",fontSize:11,fontWeight:700,marginBottom:10,textTransform:"uppercase"}}>{t('supp.addSection',language)}</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <input value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addSup()}
            placeholder={t('supp.namePlaceholder',language)} style={{flex:"1 1 140px",background:"var(--nm-input-bg)",boxShadow:"var(--nm-inset)",border:"none",borderRadius:8,color:"var(--text)",padding:"8px 12px",fontSize:13,outline:"none",fontFamily:"inherit"}}/>
          <input value={newDose} onChange={e=>setNewDose(e.target.value)} placeholder={t('supp.dosePlaceholder',language)}
            style={{flex:"1 1 120px",background:"var(--nm-input-bg)",boxShadow:"var(--nm-inset)",border:"none",borderRadius:8,color:"var(--text)",padding:"8px 12px",fontSize:13,outline:"none",fontFamily:"inherit"}}/>
          <select value={newTime} onChange={e=>setNewTime(e.target.value)}
            style={{flex:"0 0 130px",background:"var(--nm-input-bg)",boxShadow:"var(--nm-inset)",border:"none",borderRadius:8,color:"var(--text)",padding:"8px 10px",fontSize:13,outline:"none",fontFamily:"inherit"}}>
            {TIMES.map(tm=><option key={tm} value={tm}>{TIME_ICONS[tm]} {TIME_LABELS[tm]}</option>)}
          </select>
          <button onClick={addSup} style={{background:"linear-gradient(135deg,var(--accent2),var(--accent))",border:"none",borderRadius:8,color:"#fff",padding:"8px 16px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>{t('supp.add',language)}</button>
        </div>
      </div>

      {supplements.length===0 && (
        <div style={{textAlign:"center",padding:"40px 0",color:"var(--text-muted)"}}>
          <div style={{fontSize:40,marginBottom:10}}>💊</div>
          <div style={{fontSize:14}}>{t('supp.empty',language)}</div>
          <div style={{fontSize:12,marginTop:4}}>{t('supp.emptyHint',language)}</div>
        </div>
      )}

      {byTime.map(({time,items})=>(
        <div key={time} style={{marginBottom:20}}>
          <div style={{color:TIME_COLORS[time],fontWeight:700,fontSize:12,letterSpacing:.8,textTransform:"uppercase",marginBottom:8}}>
            {TIME_ICONS[time]} {TIME_LABELS[time]}
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
                <div style={{color:done?TIME_COLORS[time]:"var(--text-muted)",fontSize:11,fontWeight:700}}>{done?t('supp.taken',language):t('supp.tapToLog',language)}</div>
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
function StatisticsPanel({recipes, mealPlanItems, ratings, favorites, shoppingSpends, cookLog, macroGoals, setMacroGoals, onDeleteSpend, profileSelector, language='en'}) {
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
      <h2 style={{color:"var(--text)",fontFamily:"'Playfair Display',serif",marginBottom:4}}>{t('stat.title',language)}</h2>
      <p style={{color:"var(--text-sub)",fontSize:13,marginBottom:14}}>{t('stat.subtitle',language)}</p>
      {profileSelector}

      {/* Summary cards */}
      <div className="r-grid-sm" style={{marginBottom:24}}>
        {(()=>{
          const streak = computeWeeklyStreak(cookLog);
          return <StatCard icon="🔥" value={streak} label={t('stat.weekStreak',language)} color="#ffd580" sub={t('stat.totalSessions',language,{n:String((cookLog||[]).length)})}/>;
        })()}
        <StatCard icon="📖" value={totalRecipes} label={t('stat.totalRecipes',language)} color="#5a8fd4"/>
        <StatCard icon="⏱" value={avgCookTime+"m"} label={t('stat.avgCookTime',language)} color="#d4875a"/>
        <StatCard icon="📅" value={mealPlanItems.length} label={t('stat.mealsPlanned',language)} color="#5aad8e"/>
        <StatCard icon="💰" value={"$"+totalSpend.toFixed(2)} label={t('stat.totalSpent',language)} color="#c06090" sub={`${(shoppingSpends||[]).length} ${t('stat.trips',language)} $${avgSpend.toFixed(2)}`}/>
        <StatCard icon="♥" value={favorites.length} label={t('stat.favorites',language)} color="#e05a6a"/>
        <StatCard icon="⭐" value={ratedRecipes.length} label={t('stat.rated',language)} color="#ffd580"/>
      </div>

      {/* Macro Goals Editor */}
      <div style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised)",borderRadius:16,padding:"18px 16px",marginBottom:24}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:editingGoals?14:0}}>
          <div style={{color:"var(--text)",fontWeight:700,fontSize:13}}>{t('stat.macroGoals',language)}</div>
          <button onClick={()=>{if(editingGoals){setMacroGoals(goalDraft);}setEditingGoals(e=>!e);}} style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised-sm)",border:"none",borderRadius:8,color:editingGoals?"var(--accent)":"var(--text-sub)",padding:"4px 10px",fontSize:12,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>
            {editingGoals?t('stat.saveGoals',language):t('stat.editGoals',language)}
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
          <div style={{color:"var(--text)",fontWeight:700,fontSize:13,marginBottom:14}}>{t('stat.byCategory',language)}</div>
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
          <div style={{color:"var(--text)",fontWeight:700,fontSize:13,marginBottom:14}}>{t('stat.avgNutrition',language)}</div>
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
          <div style={{color:"var(--text)",fontWeight:700,fontSize:13,marginBottom:14}}>{t('stat.topTags',language)}</div>
          {topTags.length===0 && <div style={{color:"var(--text-muted)",fontSize:12}}>{t('stat.noTags',language)}</div>}
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
          <div style={{color:"var(--text)",fontWeight:700,fontSize:13,marginBottom:14}}>{t('stat.spiceDist',language)}</div>
          {spiceDist.map(({lvl,count})=>(
            <div key={lvl} style={{marginBottom:9}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:3,fontSize:12}}>
                <span style={{color:"var(--text-sub)"}}>{lvl===0?"⚪ "+t('spice.none',language):"🌶".repeat(lvl)+" "+t(SPICE_KEYS[lvl],language)}</span>
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
          <div style={{color:"var(--text)",fontWeight:700,fontSize:13,marginBottom:14}}>{t('stat.byCuisine',language)}</div>
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
          <div style={{color:"var(--text)",fontWeight:700,fontSize:13,marginBottom:14}}>{t('stat.recentSessions',language)}</div>
          {(cookLog||[]).slice().reverse().slice(0,10).map(l=>(
            <div key={l.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:"1px solid var(--border)",fontSize:12}}>
              <span style={{fontSize:18}}>{l.isComfortMeal ? "🏠" : "🍳"}</span>
              <div style={{flex:1}}>
                <span style={{color:"var(--text)"}}>{l.recipeName}</span>
                {l.isComfortMeal && <span style={{marginLeft:6,fontSize:10,background:"rgba(255,213,128,0.2)",color:"#ffd580",borderRadius:8,padding:"1px 6px",fontWeight:600}}>comfort meal</span>}
                {l.notes && <div style={{color:"var(--text-muted)",fontSize:11,marginTop:1}}>{l.notes}</div>}
              </div>
              <span style={{color:"var(--text-muted)"}}>{new Date(l.date).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>
            </div>
          ))}
        </div>
      )}

      {/* Top rated */}
      {ratedRecipes.length>0 && (
        <div style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised)",borderRadius:16,padding:"18px 16px",marginBottom:24}}>
          <div style={{color:"var(--text)",fontWeight:700,fontSize:13,marginBottom:14}}>{t('stat.topRated',language)}</div>
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

      {/* Spending breakdown */}
      {(shoppingSpends||[]).length>0 && (()=>{
        const now = new Date();
        const startOfToday = new Date(now); startOfToday.setHours(0,0,0,0);
        const startOfYesterday = new Date(startOfToday); startOfYesterday.setDate(startOfToday.getDate()-1);
        const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate()-now.getDay()); startOfWeek.setHours(0,0,0,0);
        const startOfMonth = new Date(now.getFullYear(),now.getMonth(),1);
        const startOfYear = new Date(now.getFullYear(),0,1);
        const sum = (arr) => arr.reduce((s,x)=>s+(x.amount||0),0);
        const yesterdaySpends = (shoppingSpends||[]).filter(s=>{const d=new Date(s.date);return d>=startOfYesterday&&d<startOfToday;});
        const weekSpends  = (shoppingSpends||[]).filter(s=>new Date(s.date)>=startOfWeek);
        const monthSpends = (shoppingSpends||[]).filter(s=>new Date(s.date)>=startOfMonth);
        const yearSpends  = (shoppingSpends||[]).filter(s=>new Date(s.date)>=startOfYear);
        const yesterdayTotal = sum(yesterdaySpends);
        const weekTotal  = sum(weekSpends);
        const monthTotal = sum(monthSpends);
        const yearTotal  = sum(yearSpends);
        const maxBar = Math.max(yesterdayTotal, weekTotal, monthTotal, yearTotal, 1);
        const periods = [
          {label:t('stat.yesterday',language),  value:yesterdayTotal, trips:yesterdaySpends.length, color:"#ffd580"},
          {label:t('stat.thisWeek',language),   value:weekTotal,       trips:weekSpends.length,      color:"#5aad8e"},
          {label:t('stat.thisMonth',language),  value:monthTotal,      trips:monthSpends.length,     color:"#5a8fd4"},
          {label:t('stat.thisYear',language),   value:yearTotal,       trips:yearSpends.length,      color:"#c06090"},
        ];
        return (
          <div style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised)",borderRadius:16,padding:"18px 16px",marginBottom:24}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{color:"var(--text)",fontWeight:700,fontSize:13}}>{t('stat.spendTitle',language)}</div>
              <span style={{color:"var(--text-sub)",fontSize:12}}>{t('stat.totalTrips',language,{n:String((shoppingSpends||[]).length)})}</span>
            </div>
            {/* Period summary bars */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:18}}>
              {periods.map(({label,value,trips,color})=>(
                <div key={label} style={{background:"var(--nm-input-bg)",boxShadow:"var(--nm-inset)",borderRadius:12,padding:"12px 10px",textAlign:"center"}}>
                  <div style={{color,fontWeight:800,fontSize:20}}>${value.toFixed(2)}</div>
                  <div style={{color:"var(--text-muted)",fontSize:10,textTransform:"uppercase",letterSpacing:.5,marginTop:2}}>{label}</div>
                  <div style={{color:"var(--text-sub)",fontSize:11,marginTop:4}}>{trips} {trips!==1?t('stat.trips2',language):t('stat.trip',language)}</div>
                </div>
              ))}
            </div>
            {/* Comparison bars */}
            {periods.map(({label,value,color})=>(
              <div key={label} style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4,fontSize:12}}>
                  <span style={{color:"var(--text-sub)"}}>{label}</span>
                  <span style={{color,fontWeight:700}}>${value.toFixed(2)}</span>
                </div>
                <Bar pct={value/maxBar*100} color={color}/>
              </div>
            ))}
            {/* Recent trips */}
            <div style={{marginTop:16,borderTop:"1px solid var(--border)",paddingTop:14}}>
              <div style={{color:"var(--text-muted)",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:10}}>{t('stat.recentTrips',language)}</div>
              {(shoppingSpends||[]).slice().reverse().map(s=>(
                <div key={s.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:"1px solid var(--border)"}}>
                  <span style={{fontSize:16}}>🛒</span>
                  <div style={{flex:1}}>
                    <div style={{color:"var(--text)",fontSize:13}}>{s.note}</div>
                    <div style={{color:"var(--text-muted)",fontSize:11}}>{new Date(s.date).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</div>
                  </div>
                  <span style={{color:"var(--accent)",fontWeight:700,fontSize:14}}>${s.amount.toFixed(2)}</span>
                  <button onClick={()=>onDeleteSpend?.(s.id)} style={{background:"none",border:"none",color:"var(--text-muted)",fontSize:14,cursor:"pointer",padding:"0 4px"}} title="Delete">×</button>
                </div>
              ))}
              <div style={{marginTop:10,fontSize:12,color:"var(--text-sub)"}}>
                📈 {t('stat.avgPerTrip',language)} <strong style={{color:"var(--text)"}}>${avgSpend.toFixed(2)}</strong>
              </div>
            </div>
          </div>
        );
      })()}

      {totalRecipes===0 && (
        <div style={{textAlign:"center",padding:"40px 0",color:"var(--text-muted)"}}>
          <div style={{fontSize:40,marginBottom:10}}>📊</div>
          <div style={{fontSize:14}}>{t('stat.noData',language)}</div>
        </div>
      )}
    </div>
  );
}

// ─── WHAT CAN I COOK ──────────────────────────────────────────────────────────
// ─── SPIN THE WHEEL ───────────────────────────────────────────────────────────
function SpinWheelModal({recipes, onClose, onView, language='en'}) {
  const [spinning, setSpinning] = useState(false);
  const [pick, setPick] = useState(null);
  const [angle, setAngle] = useState(0);

  const spin = () => {
    if (spinning || !recipes.length) return;
    setSpinning(true); setPick(null);
    const spins = 1440 + Math.random()*720;
    setAngle(a => a + spins);
    setTimeout(() => {
      const chosen = recipes[Math.floor(Math.random()*recipes.length)];
      setPick(chosen); setSpinning(false);
    }, 2200);
  };

  return (
    <div className="modal-wrap" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"var(--bg-card)",borderRadius:24,maxWidth:420,width:"100%",padding:32,border:"1px solid var(--border)",textAlign:"center"}}>
        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
          <button onClick={onClose} style={{background:"none",border:"none",color:"var(--text-muted)",fontSize:22,cursor:"pointer"}}>×</button>
        </div>
        <h2 style={{color:"var(--text)",fontFamily:"'Playfair Display',serif",margin:"0 0 8px"}}>{t('spin.title',language)}</h2>
        <p style={{color:"var(--text-muted)",fontSize:13,marginBottom:28}}>{t('spin.subtitle',language)}</p>

        {/* Wheel visual */}
        <div style={{position:"relative",width:200,height:200,margin:"0 auto 28px"}}>
          <div style={{width:200,height:200,borderRadius:"50%",border:"4px solid var(--accent)",background:"conic-gradient(#5aad8e,#5a8fd4,#d4875a,#ffd580,#c06090,#5aad8e)",
            transform:`rotate(${angle}deg)`,transition:spinning?"transform 2.2s cubic-bezier(.17,.67,.12,1)":"none",
            display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{width:60,height:60,borderRadius:"50%",background:"var(--bg-card)",border:"3px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28}}>🍽️</div>
          </div>
          <div style={{position:"absolute",top:-12,left:"50%",transform:"translateX(-50%)",fontSize:24}}>▼</div>
        </div>

        {pick && !spinning && (
          <div style={{background:"var(--nm-input-bg)",borderRadius:16,padding:16,marginBottom:20}}>
            {pick.image&&<img src={pick.image} alt={pick.title} style={{width:80,height:80,borderRadius:12,objectFit:"cover",marginBottom:10}} onError={e=>e.target.style.display="none"}/>}
            <div style={{color:"var(--text)",fontWeight:700,fontSize:18,marginBottom:4}}>{pick.title}</div>
            <div style={{color:"var(--text-muted)",fontSize:13}}>{pick.totalTime||0} min · {pick.category}</div>
          </div>
        )}

        <div style={{display:"flex",gap:10,justifyContent:"center"}}>
          <button onClick={spin} disabled={spinning||!recipes.length}
            style={{background:"linear-gradient(135deg,var(--accent2),var(--accent))",border:"none",borderRadius:12,color:"#fff",padding:"12px 32px",fontWeight:800,fontSize:16,cursor:"pointer",fontFamily:"inherit",opacity:spinning?0.6:1}}>
            {spinning?t('spin.spinning',language):t('spin.btn',language)}
          </button>
          {pick&&!spinning&&<button onClick={()=>{onView(pick);onClose();}} style={{...GB,padding:"12px 20px",fontSize:14,fontWeight:700,color:"#5aad8e"}}>{t('spin.cookThis',language)}</button>}
        </div>
      </div>
    </div>
  );
}

// ─── RECIPE REMIX ─────────────────────────────────────────────────────────────
function RecipeRemixModal({recipes, onClose, onAdd, language='en'}) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const remix = async () => {
    const ra = recipes.find(r=>r.id===+a), rb = recipes.find(r=>r.id===+b);
    if (!ra||!rb) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const raw = await anthropicCall({max_tokens:1500,
        system:"You are a creative chef. Respond ONLY with valid JSON, no markdown.",
        messages:[{role:"user",content:`Fuse these two recipes into one creative fusion dish:\n\nRecipe A: ${ra.title}\nIngredients: ${(ra.ingredients||[]).map(i=>i.name).join(", ")}\n\nRecipe B: ${rb.title}\nIngredients: ${(rb.ingredients||[]).map(i=>i.name).join(", ")}\n\nCreate a single fusion recipe JSON:\n{"title":"","description":"","ingredients":[{"name":"","amount":1,"unit":"","section":"main"}],"steps":[{"text":"","timeMin":5}],"prepTime":10,"cookTime":20,"servings":2,"category":"${ra.category||"lunch"}"}`}]
      });
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("No JSON");
      const fused = JSON.parse(m[0]);
      setResult({...fused, id:Date.now(), tags:[], allergens:[], equipment:[], goal:[], image:null});
    } catch(e) { setError(e.message); }
    setLoading(false);
  };

  const SS = {color:"var(--text)",background:"var(--nm-input-bg)",border:"1px solid var(--border)",borderRadius:8,padding:"8px 10px",fontSize:13,fontFamily:"inherit",width:"100%"};
  return (
    <div className="modal-wrap" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,overflowY:"auto"}}>
      <div style={{background:"var(--bg-card)",borderRadius:20,maxWidth:540,width:"100%",maxHeight:"90vh",overflowY:"auto",padding:24,border:"1px solid var(--border)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <h2 style={{color:"var(--text)",fontFamily:"'Playfair Display',serif",margin:0}}>{t('remix.title',language)}</h2>
          <button onClick={onClose} style={{background:"none",border:"none",color:"var(--text-muted)",fontSize:22,cursor:"pointer"}}>×</button>
        </div>
        <p style={{color:"var(--text-muted)",fontSize:13,marginBottom:20}}>{t('remix.subtitle',language)}</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:10,alignItems:"center",marginBottom:16}}>
          <select value={a} onChange={e=>setA(e.target.value)} style={SS}>
            <option value="">{t('remix.pickA',language)}</option>
            {recipes.map(r=><option key={r.id} value={r.id}>{r.title}</option>)}
          </select>
          <span style={{color:"var(--accent)",fontWeight:700,fontSize:18}}>+</span>
          <select value={b} onChange={e=>setB(e.target.value)} style={SS}>
            <option value="">{t('remix.pickB',language)}</option>
            {recipes.map(r=><option key={r.id} value={r.id}>{r.title}</option>)}
          </select>
        </div>
        <button onClick={remix} disabled={!a||!b||loading||a===b}
          style={{width:"100%",background:"linear-gradient(135deg,var(--accent2),var(--accent))",border:"none",borderRadius:12,color:"#fff",padding:14,fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"inherit",marginBottom:20,opacity:(!a||!b||loading||a===b)?0.5:1}}>
          {loading?t('remix.fusing',language):t('remix.fuseBtn',language)}
        </button>
        {error&&<div style={{color:"#d45a5a",fontSize:13,marginBottom:12}}>{error}</div>}
        {result&&(
          <div style={{background:"var(--nm-input-bg)",borderRadius:14,padding:16}}>
            <div style={{color:"var(--text)",fontWeight:700,fontSize:18,marginBottom:6}}>{result.title}</div>
            <div style={{color:"var(--text-muted)",fontSize:13,marginBottom:12}}>{result.description}</div>
            <div style={{marginBottom:8}}>
              <div style={{color:"var(--text-sub)",fontSize:11,fontWeight:700,marginBottom:6,textTransform:"uppercase"}}>{t('label.ingredients',language)}</div>
              {(result.ingredients||[]).map((ing,i)=><div key={i} style={{color:"var(--text)",fontSize:13,marginBottom:2}}>• {ing.amount} {ing.unit} {ing.name}</div>)}
            </div>
            <button onClick={()=>{onAdd(result);onClose();}}
              style={{...GB,width:"100%",padding:12,fontWeight:700,color:"#5aad8e",border:"1px solid rgba(90,173,142,0.4)",marginTop:8}}>
              {t('remix.saveBtn',language)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── INGREDIENT WIKI ──────────────────────────────────────────────────────────
function IngredientWikiModal({ingredient, onClose, language='en'}) {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(()=>{
    const fetch = async ()=>{
      try {
        const raw = await anthropicCall({max_tokens:600,
          system:"You are a culinary expert. Respond ONLY with valid JSON.",
          messages:[{role:"user",content:`Give a quick reference for the ingredient: "${ingredient}"\nReturn JSON: {"emoji":"","select":"How to pick the best one at the store","store":"How to store it and shelf life","sub":"Best substitutes if unavailable","pairs":"What it pairs well with","tip":"One pro chef tip"}`}]
        });
        const m=raw.match(/\{[\s\S]*\}/);
        if(m) setInfo(JSON.parse(m[0]));
      } catch(e){}
      setLoading(false);
    };
    fetch();
  },[ingredient]);

  const Row = ({icon,label,value})=>value?(
    <div style={{borderBottom:"1px solid var(--border)",paddingBottom:10,marginBottom:10}}>
      <div style={{color:"var(--text-muted)",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:3}}>{icon} {label}</div>
      <div style={{color:"var(--text)",fontSize:13,lineHeight:1.5}}>{value}</div>
    </div>
  ):null;

  return (
    <div className="modal-wrap" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:1100,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"var(--bg-card)",borderRadius:20,maxWidth:420,width:"100%",maxHeight:"85vh",overflowY:"auto",padding:24,border:"1px solid var(--border)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h2 style={{color:"var(--text)",fontFamily:"'Playfair Display',serif",margin:0}}>{info?.emoji||"🌿"} {ingredient}</h2>
          <button onClick={onClose} style={{background:"none",border:"none",color:"var(--text-muted)",fontSize:22,cursor:"pointer"}}>×</button>
        </div>
        {loading?<div style={{textAlign:"center",color:"var(--text-muted)",padding:"32px 0"}}>{t('wiki.loading',language)}</div>:(
          info ? <>
            <Row icon="🛒" label={t('wiki.howToPick',language)} value={info.select}/>
            <Row icon="📦" label={t('wiki.storage',language)} value={info.store}/>
            <Row icon="🔄" label={t('wiki.substitutes',language)} value={info.sub}/>
            <Row icon="🍽️" label={t('wiki.pairs',language)} value={info.pairs}/>
            <Row icon="👨‍🍳" label={t('wiki.chefTip',language)} value={info.tip}/>
          </> : <div style={{color:"var(--text-muted)",textAlign:"center",padding:"24px 0"}}>{t('wiki.error',language)}</div>
        )}
      </div>
    </div>
  );
}

function WhatCanICookModal({recipes, onClose, onView, pantry=[], language='en'}) {
  // Pre-populate with all pantry items on first open
  const [ingredients, setIngredients] = useState(()=>pantry.map(p=>p.name.toLowerCase()));
  const [input, setInput] = useState("");

  const toggle = name => {
    const v = name.toLowerCase();
    setIngredients(i=>i.includes(v) ? i.filter(x=>x!==v) : [...i,v]);
  };

  const addIng = () => {
    const v = input.trim().toLowerCase();
    if (v && !ingredients.includes(v)) setIngredients(i=>[...i,v]);
    setInput("");
  };

  const scored = useMemo(()=>{
    if (!ingredients.length) return [];
    return recipes.map(r=>{
      const recipeIngs = (r.ingredients||[]).map(i=>(i.name||"").toLowerCase());
      const matched = ingredients.filter(p=>recipeIngs.some(ri=>ri.includes(p)||p.includes(ri.split(" ")[0])));
      const pct = Math.round(matched.length/Math.max(ingredients.length,1)*100);
      const missing = (r.ingredients||[]).filter(ri=>!ingredients.some(p=>(ri.name||"").toLowerCase().includes(p)||p.includes((ri.name||"").toLowerCase().split(" ")[0]))).length;
      return {...r,_matched:matched.length,_pct:pct,_missing:missing};
    }).filter(r=>r._matched>0).sort((a,b)=>b._pct-a._pct);
  },[ingredients,recipes]);

  // Separate pantry items from manually typed ones
  const pantryNames = new Set(pantry.map(p=>p.name.toLowerCase()));
  const manualIngs = ingredients.filter(i=>!pantryNames.has(i));

  return (
    <div className="modal-wrap" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,overflowY:"auto"}}>
      <div style={{background:"var(--bg-card)",borderRadius:20,maxWidth:640,width:"100%",maxHeight:"90vh",overflowY:"auto",padding:24,border:"1px solid var(--border)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <h2 style={{color:"var(--text)",fontFamily:"'Playfair Display',serif",margin:0}}>{t('cook2.title',language)}</h2>
          <button onClick={onClose} style={{background:"none",border:"none",color:"var(--text-muted)",fontSize:22,cursor:"pointer"}}>×</button>
        </div>
        <p style={{color:"var(--text-muted)",fontSize:13,marginBottom:16}}>{t('cook2.subtitle',language)}</p>

        {/* Pantry items grid */}
        {pantry.length>0&&(
          <div style={{marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{color:"var(--text-sub)",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>🥫 Your Pantry ({pantry.length} items)</div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setIngredients(pantry.map(p=>p.name.toLowerCase()))} style={{...GB,padding:"3px 10px",fontSize:11,color:"#5aad8e"}}>{t('cook2.selectAll',language)}</button>
                <button onClick={()=>setIngredients(i=>i.filter(x=>!pantryNames.has(x)))} style={{...GB,padding:"3px 10px",fontSize:11,color:"var(--text-muted)"}}>None</button>
              </div>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {pantry.map(p=>{
                const on = ingredients.includes(p.name.toLowerCase());
                return (
                  <button key={p.id} onClick={()=>toggle(p.name)}
                    style={{...GB,padding:"6px 12px",fontSize:13,borderRadius:20,
                      background:on?"rgba(90,173,142,0.2)":"var(--nm-input-bg)",
                      border:on?"1px solid rgba(90,173,142,0.5)":"1px solid var(--border)",
                      color:on?"#5aad8e":"var(--text-muted)",fontWeight:on?700:400,
                      display:"flex",alignItems:"center",gap:6}}>
                    <span>{getItemEmoji(p.name)}</span>
                    <span>{p.name}</span>
                    {p.amount>0&&<span style={{fontSize:10,opacity:.6}}>{p.amount}{p.unit}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Manual add */}
        <div style={{marginBottom:12}}>
          <div style={{color:"var(--text-sub)",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:8}}>{t('cook2.addMore',language)}</div>
          <div style={{display:"flex",gap:8}}>
            <input value={input} onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter"||e.key===","){e.preventDefault();addIng();}}}
              placeholder={t('cook2.addPlaceholder',language)}
              style={{...IS,flex:1,height:38,padding:"0 12px",fontSize:14}}/>
            <button onClick={addIng} style={{...GB,padding:"0 16px",fontWeight:700,color:"#5aad8e",border:"1px solid rgba(90,173,142,0.4)"}}>+ Add</button>
          </div>
        </div>

        {/* Manual ingredient chips */}
        {manualIngs.length>0&&(
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
            {manualIngs.map(ing=>(
              <span key={ing} onClick={()=>setIngredients(i=>i.filter(x=>x!==ing))}
                style={{background:"rgba(90,143,212,0.15)",border:"1px solid rgba(90,143,212,0.4)",borderRadius:20,padding:"4px 12px",fontSize:13,color:"#5a8fd4",cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
                {ing} <span style={{fontSize:11,opacity:.7}}>×</span>
              </span>
            ))}
          </div>
        )}

        {/* Summary line */}
        {ingredients.length>0&&(
          <div style={{color:"var(--text-muted)",fontSize:12,marginBottom:14}}>
            {t('cook2.results',language,{ing:String(ingredients.length),rec:String(scored.length)})}
          </div>
        )}

        {ingredients.length>0&&scored.length===0&&(
          <div style={{textAlign:"center",color:"var(--text-muted)",padding:"32px 0",fontSize:14}}>{t('cook2.noMatches',language)}</div>
        )}
        {ingredients.length===0&&pantry.length===0&&(
          <div style={{textAlign:"center",color:"var(--text-muted)",padding:"32px 0",fontSize:14}}>{t('cook2.noPantry',language)}</div>
        )}

        {scored.map(r=>(
          <div key={r.id} onClick={()=>{onView(r);onClose();}}
            style={{display:"flex",gap:12,alignItems:"center",background:"var(--nm-input-bg)",borderRadius:14,padding:"12px",marginBottom:8,cursor:"pointer",border:"1px solid var(--border)",transition:"border-color .15s"}}
            onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(90,173,142,0.4)"}
            onMouseLeave={e=>e.currentTarget.style.borderColor="var(--border)"}>
            {r.image
              ? <img src={r.image} alt={r.title} style={{width:56,height:56,borderRadius:10,objectFit:"cover",flexShrink:0}} onError={e=>e.target.style.display="none"}/>
              : <div style={{width:56,height:56,borderRadius:10,background:"var(--bg-card)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,flexShrink:0}}>{getItemEmoji(r.title)}</div>}
            <div style={{flex:1,minWidth:0}}>
              <div style={{color:"var(--text)",fontWeight:700,fontSize:14,marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.title}</div>
              <div style={{color:"var(--text-muted)",fontSize:12}}>
                {r._missing===0
                  ? <span style={{color:"#5aad8e"}}>✅ You have everything!</span>
                  : <span>⚠️ Missing {r._missing} ingredient{r._missing!==1?"s":""}</span>}
                {" · "}{r.totalTime||0} min
              </div>
            </div>
            <div style={{flexShrink:0,textAlign:"center",minWidth:48}}>
              <div style={{fontSize:22,fontWeight:800,color:r._pct>=80?"#5aad8e":r._pct>=50?"#ffd580":"#d4875a",lineHeight:1}}>{r._pct}%</div>
              <div style={{fontSize:10,color:"var(--text-muted)"}}>match</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── PANTRY MANAGER ───────────────────────────────────────────────────────────
function PantryManager({pantry, setPantry, recipes, language='en'}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState("");
  const [lowAt, setLowAt] = useState("");
  const [price, setPrice] = useState("");
  const [search, setSearch] = useState("");
  const [editId, setEditId] = useState(null);

  const add = () => {
    if (!name.trim()) return;
    if (editId) {
      setPantry(p=>p.map(x=>x.id===editId?{...x,name:name.trim(),amount:parseFloat(amount)||0,unit:unit.trim(),lowAt:parseFloat(lowAt)||0,price:parseFloat(price)||0}:x));
      setEditId(null);
    } else {
      setPantry(p=>[...p,{id:Date.now(),name:name.trim(),amount:parseFloat(amount)||0,unit:unit.trim(),lowAt:parseFloat(lowAt)||0,price:parseFloat(price)||0}]);
    }
    setName(""); setAmount(""); setUnit(""); setLowAt(""); setPrice("");
  };

  const startEdit = item => { setEditId(item.id); setName(item.name); setAmount(String(item.amount)); setUnit(item.unit); setLowAt(String(item.lowAt||"")); setPrice(String(item.price||"")); };
  const remove = id => setPantry(p=>p.filter(x=>x.id!==id));
  const adjust = (id, delta) => setPantry(p=>p.map(x=>x.id===id?{...x,amount:Math.max(0,+(x.amount+delta).toFixed(2))}:x));

  const lowStock = pantry.filter(x=>x.lowAt>0&&x.amount<=x.lowAt);
  const displayed = pantry.filter(x=>(x.name||"").toLowerCase().includes(search.toLowerCase()));
  const totalValue = pantry.reduce((s,x)=>s+(x.amount*(x.price||0)),0);

  // Suggest quick-adds from recipe ingredients not in pantry
  const suggestions = useMemo(()=>{
    const names = new Set(pantry.map(x=>x.name.toLowerCase()));
    const seen = new Set();
    const out = [];
    recipes.forEach(r=>(r.ingredients||[]).forEach(ing=>{
      const k=(ing.name||"").toLowerCase();
      if (!names.has(k)&&!seen.has(k)){seen.add(k);out.push(ing.name);}
    }));
    return out.slice(0,8);
  },[pantry,recipes]);

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16,flexWrap:"wrap",gap:10}}>
        <div>
          <h2 style={{color:"var(--text)",fontFamily:"'Playfair Display',serif",margin:"0 0 4px"}}>🥫 {t('pantry.title',language)}</h2>
          <p style={{color:"var(--text-sub)",fontSize:13,margin:0}}>{t('pantry.estValue',language,{count:String(pantry.length),value:totalValue.toFixed(2)})}</p>
        </div>
        {lowStock.length>0&&(
          <div style={{background:"rgba(212,135,90,0.1)",border:"1px solid rgba(212,135,90,0.35)",borderRadius:10,padding:"8px 14px"}}>
            <div style={{color:"#d4875a",fontWeight:700,fontSize:12,marginBottom:4}}>⚠️ Running Low</div>
            {lowStock.map(x=><div key={x.id} style={{color:"var(--text-sub)",fontSize:12}}>• {x.name}: {x.amount} {x.unit} left</div>)}
          </div>
        )}
      </div>

      {/* Add / edit form */}
      <div style={{background:"var(--bg-card)",borderRadius:14,padding:"14px",marginBottom:18,boxShadow:"var(--nm-raised-sm)"}}>
        <div style={{color:"var(--text-sub)",fontSize:11,fontWeight:700,marginBottom:10,textTransform:"uppercase",letterSpacing:.5}}>{editId?t('pantry.editItem',language):t('pantry.addToPantry',language)}</div>
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr",gap:8,marginBottom:10}}>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder={t('pantry.name',language)} style={{...IS,height:36,padding:"0 10px",fontSize:13}}/>
          <input value={amount} onChange={e=>setAmount(e.target.value)} placeholder={t('pantry.amount',language)} type="number" style={{...IS,height:36,padding:"0 10px",fontSize:13}}/>
          <input value={unit} onChange={e=>setUnit(e.target.value)} placeholder={t('pantry.unit',language)} style={{...IS,height:36,padding:"0 10px",fontSize:13}}/>
          <input value={lowAt} onChange={e=>setLowAt(e.target.value)} placeholder={t('pantry.lowAt',language)} type="number" title="Alert when quantity falls below this" style={{...IS,height:36,padding:"0 10px",fontSize:13}}/>
          <input value={price} onChange={e=>setPrice(e.target.value)} placeholder={t('pantry.pricePerUnit',language)} type="number" style={{...IS,height:36,padding:"0 10px",fontSize:13}}/>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={add} style={{background:"linear-gradient(135deg,var(--accent2),var(--accent))",border:"none",borderRadius:10,color:"#fff",padding:"8px 20px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
            {editId?t('pantry.saveItem',language):t('pantry.add',language)}
          </button>
          {editId&&<button onClick={()=>{setEditId(null);setName("");setAmount("");setUnit("");setLowAt("");setPrice("");}} style={{...GB,padding:"8px 14px",fontSize:13}}>Cancel</button>}
        </div>
      </div>

      {/* Suggestions from recipes */}
      {suggestions.length>0&&pantry.length<3&&(
        <div style={{marginBottom:16}}>
          <div style={{color:"var(--text-muted)",fontSize:11,fontWeight:700,marginBottom:8,textTransform:"uppercase",letterSpacing:.5}}>💡 Quick add from your recipes</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {suggestions.map(s=>(
              <button key={s} onClick={()=>{setName(s);setAmount("1");}}
                style={{...GB,padding:"5px 12px",fontSize:12,color:"#5a8fd4",border:"1px solid rgba(90,143,212,0.3)",borderRadius:20}}>
                + {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      {pantry.length>5&&<input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t('pantry.search',language)} style={{...IS,width:"100%",height:36,padding:"0 12px",fontSize:13,marginBottom:12}}/>}

      {/* Items list */}
      {displayed.length===0&&<div style={{textAlign:"center",color:"var(--text-muted)",padding:"40px 0",fontSize:14}}>Your pantry is empty — add ingredients you have at home.</div>}
      <div style={{display:"grid",gap:6}}>
        {displayed.map(item=>{
          const isLow = item.lowAt>0&&item.amount<=item.lowAt;
          return (
            <div key={item.id} style={{display:"flex",alignItems:"center",gap:10,background:"var(--bg-card)",borderRadius:12,padding:"10px 14px",boxShadow:"var(--nm-raised-sm)",border:isLow?"1px solid rgba(212,135,90,0.4)":"1px solid transparent"}}>
              <span style={{fontSize:20,flexShrink:0}}>{getItemEmoji(item.name)}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:"var(--text)",fontWeight:600,fontSize:13}}>{item.name} {isLow&&<span style={{color:"#d4875a",fontSize:11}}>⚠️ low</span>}</div>
                <div style={{color:"var(--text-muted)",fontSize:12}}>{item.price>0?`$${item.price}/${item.unit||"unit"}`:""}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                <button onClick={()=>adjust(item.id,-1)} style={{...GB,width:26,height:26,padding:0,fontSize:16,lineHeight:"1"}}>−</button>
                <span style={{color:isLow?"#d4875a":"var(--accent)",fontWeight:700,fontSize:14,minWidth:50,textAlign:"center"}}>{item.amount} {item.unit}</span>
                <button onClick={()=>adjust(item.id,1)} style={{...GB,width:26,height:26,padding:0,fontSize:16,lineHeight:"1"}}>+</button>
              </div>
              <button onClick={()=>startEdit(item)} style={{...GB,padding:"4px 8px",fontSize:12,color:"var(--text-muted)"}}>✏️</button>
              <button onClick={()=>remove(item.id)} style={{...GB,padding:"4px 8px",fontSize:12,color:"#f08080"}}>🗑</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
function App() {
  const [recipes, setRecipes] = useState(SAMPLE_RECIPES);
  // Tombstone set — IDs the user deliberately deleted. Persisted to localStorage
  // so cloud sync never re-adds them from Supabase.
  const deletedIdsRef = useRef(new Set((() => { try { return JSON.parse(localStorage.getItem('mpm_deleted_ids')||'[]'); } catch(e) { return []; } })()));
  const trackDeleted = (id, currentRecipes) => {
    deletedIdsRef.current.add(String(id));
    lsSave('mpm_deleted_ids', JSON.stringify([...deletedIdsRef.current]));
    // Synchronously write the filtered recipe list so a refresh before React's
    // save effect fires still reads the correct data.
    if (currentRecipes) lsSave('mpm_recipes', currentRecipes.filter(r => String(r.id) !== String(id)));
  };
  const [sec, setSec] = useState("dashboard");
  const [catF, setCatF] = useState("all");
  const [tagF, setTagF] = useState(null);
  const [healthF, setHealthF] = useState(null);
  const [goalF, setGoalF] = useState(null);
  const [cuisineF, setCuisineF] = useState(null);
  const [applianceF, setApplianceF] = useState([]);
  const [search, setSearch] = useState("");
  const [comfortModalOpen, setComfortModalOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [whatCanICookOpen, setWhatCanICookOpen] = useState(false);
  const [spinWheelOpen, setSpinWheelOpen] = useState(false);
  const [remixOpen, setRemixOpen] = useState(false);
  const [wikiIngredient, setWikiIngredient] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addInitialUrl, setAddInitialUrl] = useState("");
  const [editTarget, setEditTarget] = useState(null);
  const [sidebar, setSidebar] = useState(true);
  const [favorites, setFavorites] = useState([]);
  const [mealPlanItems, setMealPlanItems] = useState([]);
  const [ratings, setRatings] = useState({});
  const [ratingTarget, setRatingTarget] = useState(null);
  const [shoppingSpends, setShoppingSpends] = useState([]);
  const [pantry, setPantry] = useState([]); // [{id,name,amount,unit,lowAt,price}]
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
  const [language, setLanguage] = useState('en');
  const [searchOpen, setSearchOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [translatedRecipes, setTranslatedRecipes] = useState<Record<string,any>>({});
  const [translatingCount, setTranslatingCount] = useState(0);
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
            const deleted = deletedIdsRef.current;
            return d.recipes
              .filter(r => !deleted.has(String(r.id)))
              .map(r => {
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
          const deleted = deletedIdsRef.current;
          return d.recipes
            .filter(r => !deleted.has(String(r.id)))
            .map(r => {
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
    // One-time migration: remove built-in sample recipes (IDs 1–6)
    const SAMPLE_IDS = new Set([1,2,3,4,5,6].map(String));
    try {
      const saved = localStorage.getItem('mpm_recipes');
      if (saved) {
        const filtered = JSON.parse(saved).filter(r => !SAMPLE_IDS.has(String(r.id)));
        if (filtered.length !== JSON.parse(saved).length) {
          localStorage.setItem('mpm_recipes', JSON.stringify(filtered));
        }
      }
    } catch(_) {}

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
      const deleted = deletedIdsRef.current;
      const saved = localStorage.getItem('mpm_recipes');
      if (saved) setRecipes(JSON.parse(saved).filter(r => !deleted.has(String(r.id))));
      const favs = localStorage.getItem('mpm_favorites');
      if (favs) setFavorites(JSON.parse(favs));
      const plan = localStorage.getItem('mpm_mealplan');
      if (plan) setMealPlanItems(JSON.parse(plan));
      const rats = localStorage.getItem('mpm_ratings');
      if (rats) setRatings(JSON.parse(rats));
      const spends = localStorage.getItem('mpm_spends');
      if (spends) setShoppingSpends(JSON.parse(spends));
      const pan = localStorage.getItem('mpm_pantry');
      if (pan) setPantry(JSON.parse(pan));
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
    const savedLang = localStorage.getItem('mpm_language') || 'en';
    setLanguage(savedLang);
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
  useEffect(() => { if (hydrated) lsSave('mpm_pantry', pantry); }, [pantry, hydrated]);
  useEffect(() => { if (hydrated) lsSave('mpm_profiles', profiles); }, [profiles, hydrated]);
  useEffect(() => { localStorage.setItem('mpm_language', language); }, [language]);
  useEffect(() => { if (hydrated) lsSave('mpm_active_profile', activeProfileId); }, [activeProfileId, hydrated]);

  // Auto-translate viewing recipe when language changes
  useEffect(() => {
    const keyToUse = anthropicKey?.trim() || pwaGet('anthropic_key') || '';
    if (viewing && language !== 'en' && keyToUse) {
      const timer = setTimeout(async () => {
        try {
          const translated = await translateRecipe(viewing, language, keyToUse);
          if (translated && translated.id === viewing.id) {
            setViewing(translated);
            setTranslatedRecipes(p => ({...p, [translated.id]: translated}));
          }
        } catch(e) { console.warn('Translation failed:', e); }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [language, viewing?.id, anthropicKey]);

  // Load cached translations when language changes
  useEffect(() => {
    if (language === 'en') { setTranslatedRecipes({}); return; }
    const cached: Record<string,any> = {};
    recipes.forEach(r => {
      const key = `mpm_recipe_translation_${r.id}_${language}`;
      const c = localStorage.getItem(key);
      if (c) { try { cached[r.id] = mergeTranslation(r, JSON.parse(c)); } catch {} }
    });
    setTranslatedRecipes(cached);
  }, [language]);

  // Background-translate all recipes when language or API key changes (batch mode: 2 per call)
  useEffect(() => {
    const keyToUse = anthropicKey?.trim() || pwaGet('anthropic_key') || '';
    if (language === 'en' || !keyToUse || !hydrated || recipes.length === 0) return;
    let cancelled = false;
    const needTranslation = recipes.filter(r => !localStorage.getItem(`mpm_recipe_translation_${r.id}_${language}`));
    if (needTranslation.length > 0) setTranslatingCount(needTranslation.length);
    (async () => {
      let remaining = needTranslation.length;
      // First: load cached ones immediately (merging slim text cache back with original images)
      const cached: Record<string,any> = {};
      recipes.forEach(r => {
        const c = localStorage.getItem(`mpm_recipe_translation_${r.id}_${language}`);
        if (c) try { cached[r.id] = mergeTranslation(r, JSON.parse(c)); } catch(e) {}
      });
      if (Object.keys(cached).length > 0 && !cancelled) setTranslatedRecipes(p => ({...p, ...cached}));
      // Batch-translate uncached ones in groups of 2 (keeps requests small to avoid truncation)
      const BATCH = 2;
      for (let i = 0; i < needTranslation.length; i += BATCH) {
        if (cancelled) break;
        const batch = needTranslation.slice(i, i + BATCH);
        try {
          const translated = await translateRecipesBatch(batch, language);
          if (!cancelled) {
            const updates: Record<string,any> = {};
            translated.forEach(r => { if (r && r.id) updates[r.id] = r; });
            setTranslatedRecipes(p => ({...p, ...updates}));
            remaining = Math.max(0, remaining - batch.length);
            setTranslatingCount(remaining);
          }
        } catch(e) { console.warn('Translation batch error:', e); }
        if (!cancelled && i + BATCH < needTranslation.length) await new Promise(res => setTimeout(res, 800));
      }
      if (!cancelled) setTranslatingCount(0);
    })();
    return () => { cancelled = true; setTranslatingCount(0); };
  }, [language, anthropicKey, hydrated, recipes.length]);

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
            const cloudOnly = cloudRecipes.filter(cr => !syncedRecipes.some(lr => lr.id === cr.id) && !deletedIdsRef.current.has(String(cr.id)));
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
    if (applianceF.length > 0 && !applianceF.some(a => (r.equipment||[]).includes(a))) return false;
    if (search && !(r.title||"").toLowerCase().includes(search.toLowerCase()) &&
        !(r.ingredients||[]).some(i=>(i.name||"").toLowerCase().includes(search.toLowerCase()))) return false;
    return true;
  });
  const anyFilterActive = catF!=="all" || tagF || healthF || goalF || cuisineF || diffF || maxTimeF !== null || maxCostF !== null || applianceF.length > 0 || search;
  const clearAllFilters = () => { setCatF("all"); setTagF(null); setHealthF(null); setGoalF(null); setCuisineF(null); setDiffF(null); setMaxTimeF(null); setMaxCostF(null); setApplianceF([]); setSearch(""); };

  const navItems = [
    {id:"dashboard",      icon:"🏠", tKey:"nav.dashboard"},
    {id:"recipes",        icon:"📖", tKey:"nav.recipes"},
    {id:"mix-match",      icon:"🔀", tKey:"nav.mixMatch"},
    {id:"meal-plan",      icon:"📅", tKey:"nav.mealPlan"},
    {id:"shopping",       icon:"🛒", tKey:"nav.shopping"},
    {id:"pantry",         icon:"🥫", tKey:"nav.pantry"},
    {id:"optimizer",      icon:"⚡", tKey:"nav.optimizer"},
    {id:"ingredient-search",icon:"🔍",tKey:"nav.ingredients"},
    {id:"favorites",      icon:"♥", tKey:"nav.favorites"},
    {id:"gallery",        icon:"📸", tKey:"nav.gallery"},
    {id:"supplements",    icon:"💊", tKey:"nav.supplements"},
    {id:"statistics",     icon:"📊", tKey:"nav.statistics"},
    {id:"settings",       icon:"⚙️", tKey:"nav.settings"},
  ];

  const toggleFav = r => setFavorites(p=>p.some(f=>f.id===r.id)?p.filter(f=>f.id!==r.id):[...p,{id:r.id}]);
  const isFav = r => favorites.some(f=>f.id===r.id);
  // Return translated version of recipe if available, else original
  const dr = (r: any) => (r && language !== 'en' && translatedRecipes[r.id]) ? translatedRecipes[r.id] : r;

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
            <div style={{color:"var(--text-muted)",fontSize:11,whiteSpace:"nowrap"}}>{t('sidebar.recipesSaved',language,{n:String(recipes.length)})}</div>
          </div>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"0 8px"}}>
          {navItems.map(item=>(
            <button key={item.id} onClick={()=>navTo(item.id)}
              style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,border:"none",cursor:"pointer",marginBottom:4,background:sec===item.id?"var(--bg-card)":"transparent",boxShadow:sec===item.id?"var(--nm-raised-sm)":"none",color:sec===item.id?"var(--accent)":"var(--text-sub)",fontFamily:"inherit",fontSize:13,fontWeight:sec===item.id?600:400,textAlign:"left",whiteSpace:"nowrap",transition:"all .15s"}}>
              <span style={{fontSize:16}}>{item.icon}</span>{t(item.tKey, language)}
              {item.id==="favorites"&&favorites.length>0&&<span style={{marginLeft:"auto",background:"var(--accent)",color:"var(--bg)",borderRadius:10,padding:"0 6px",fontSize:10,fontWeight:700}}>{favorites.length}</span>}
            </button>
          ))}

          <div style={{padding:"12px 12px 4px",color:"var(--text-muted)",fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginTop:8}}>{t('nav.filterByGoal', language)}</div>
          {[null,...GOALS].map(g=>(
            <button key={g||"all"} onClick={()=>setGoalF(g)}
              style={{width:"100%",display:"flex",alignItems:"center",padding:"7px 12px",borderRadius:10,border:"none",cursor:"pointer",background:goalF===g&&g?"var(--bg-card)":"transparent",boxShadow:goalF===g&&g?"var(--nm-raised-sm)":"none",color:goalF===g&&g?"var(--accent)":"var(--text-sub)",fontFamily:"inherit",fontSize:12,textAlign:"left",whiteSpace:"nowrap",transition:"all .15s"}}>
              {g ? t(GOAL_KEYS[g]||g, language) : t('nav.allGoals', language)}
            </button>
          ))}
        </div>
        <div style={{padding:"10px 16px",borderTop:"1px solid var(--border)",flexShrink:0}}>
          <div style={{color:"var(--text-muted)",fontSize:10,textAlign:"center"}}>
            {anthropicKey ? <span style={{color:"var(--accent)"}}>{t('sidebar.aiEnabled',language)}</span> : <span style={{color:"#f08080"}}>{t('sidebar.noApiKey',language)}</span>}
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {/* Topbar */}
        <div style={{height:isMobile?52:56,background:"var(--bg-sidebar)",borderBottom:"1px solid var(--border)",boxShadow:"0 4px 12px var(--shadow-dark)",display:"flex",alignItems:"center",padding:isMobile?"0 10px":"0 16px",gap:isMobile?8:12,flexShrink:0,position:"relative",zIndex:100}}>
          <button onClick={()=>setSidebar(s=>!s)} style={{...GB,padding:"6px 10px",fontSize:16,lineHeight:1,flexShrink:0}}>☰</button>
          {!isMobile && <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t('search.placeholder',language)}
            style={{...IS,flex:1,maxWidth:380,height:36,padding:"0 12px",fontSize:13}}/>}
          <div style={{flex:1}}/>
          {isMobile && <button onClick={()=>setSearchOpen(s=>!s)} style={{...GB,padding:"6px 10px",fontSize:16,lineHeight:1,background:searchOpen?"var(--nm-input-bg)":"var(--bg-card)"}} title="Search">🔍</button>}
          <button onClick={toggleDark} title={darkMode?"Light mode":"Dark mode"}
            style={{...GB,padding:"6px 10px",fontSize:16,lineHeight:1,flexShrink:0}}>
            {darkMode?"☀️":"🌙"}
          </button>
          {/* Language switcher — always visible */}
          {(['en','es','ru'] as const).map((lang,i,arr)=>{
            const next = arr[(i+1)%arr.length];
            if (lang !== language) return null;
            const labels = {en:'EN',es:'ES',ru:'RU'};
            return (
              <button key={lang} onClick={()=>setLanguage(next)} title="Change language"
                style={{...GB,padding:"6px 10px",fontSize:13,fontWeight:700,flexShrink:0}}>
                {labels[lang]}
              </button>
            );
          })}
          <button onClick={()=>setSettingsOpen(s=>!s)} title="Settings"
            style={{...GB,background:settingsOpen?"var(--nm-inset)":"var(--bg-card)",color:"var(--text-sub)",padding:"7px 10px",fontSize:isMobile?13:13,flexShrink:0}}>
            {isMobile ? "⚙️" : ({en:"⚙️ Settings",es:"⚙️ Configuración",ru:"⚙️ Настройки"}[language]||"⚙️ Settings")}
          </button>
          <button onClick={()=>setAddOpen(true)} style={{background:"linear-gradient(135deg,var(--accent2),var(--accent))",boxShadow:"var(--nm-raised-sm)",border:"none",borderRadius:10,color:"#fff",padding:isMobile?"8px 12px":"8px 16px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",flexShrink:0}}>
            {isMobile?"＋":t('dash.addRecipe',language)}
          </button>
        </div>
        {/* Mobile search bar (expandable) */}
        {isMobile && searchOpen && (
          <div style={{background:"var(--bg-sidebar)",padding:"8px 10px",borderBottom:"1px solid var(--border)"}}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t('search.placeholder',language)} autoFocus
              style={{...IS,height:36,padding:"0 12px",fontSize:14}}/>
          </div>
        )}

        {/* Settings dropdown */}
        {settingsOpen && (
          <div style={{position:"absolute",top:64,right:16,zIndex:200,background:"var(--bg-card)",boxShadow:"var(--nm-raised),0 16px 48px var(--shadow-dark)",borderRadius:18,padding:22,width:310,maxHeight:"80vh",overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <span style={{color:"var(--text)",fontWeight:700,fontSize:14}}>⚙️ Settings</span>
              <button onClick={()=>setSettingsOpen(false)} style={{...GB,padding:"3px 9px",fontSize:18,lineHeight:1}}>×</button>
            </div>
            {/* Language Selector */}
            <div style={{marginBottom:16}}>
              <div style={{color:"var(--text-sub)",fontSize:11,fontWeight:700,marginBottom:8,textTransform:"uppercase",letterSpacing:.8}}>🌐 Language</div>
              <select value={language} onChange={e=>setLanguage(e.target.value)} style={{...IS,fontSize:13,width:"100%"}}>
                <option value="en">English</option>
                <option value="es">Español (Spanish)</option>
                <option value="ru">Русский (Russian)</option>
              </select>
              <div style={{color:"var(--text-muted)",fontSize:10,marginTop:6}}>UI and recipe content will be translated</div>
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

        {/* Global translation progress banner */}
        {translatingCount > 0 && (
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"7px 16px",background:"rgba(90,173,142,0.12)",borderBottom:"1px solid rgba(90,173,142,0.25)",fontSize:12,color:"#5aad8e",flexShrink:0}}>
            <span style={{display:"inline-block",animation:"spin 1s linear infinite",fontSize:14,lineHeight:1}}>⟳</span>
            {language==='es' ? `Traduciendo ${translatingCount} receta${translatingCount!==1?'s':''}…` : language==='ru' ? `Перевод: осталось ${translatingCount} ${translatingCount===1?'рецепт':translatingCount<5?'рецепта':'рецептов'}…` : `Translating ${translatingCount} recipe${translatingCount!==1?'s':''}…`}
          </div>
        )}

        {/* Content */}
        <div style={{flex:1,overflowY:"auto",padding:isMobile?12:24,paddingBottom:isMobile?76:24,background:"var(--bg)"}}>

          {/* Dashboard */}
          {sec==="dashboard" && (
            <div>
              <h2 style={{color:"var(--text)",fontFamily:"'Playfair Display',serif",marginBottom:6}}>{t('dash.title', language)}</h2>
              <p style={{color:"var(--text-sub)",fontSize:14,marginBottom:22}}>{t('dash.subtitle', language)}</p>
              <div className="r-grid-sm" style={{marginBottom:28}}>
                {[[recipes.length,t('dash.recipes',language),"📖","#5a8fd4"],[favorites.length,t('dash.favorites',language),"♥","#c06090"],[mealPlanItems.length,t('dash.planned',language),"📅","#5aad8e"],[recipes.filter(r=>(r.tags||[]).some(tag=>HEALTH_TAGS.includes(tag))).length,t('dash.health',language),"💚","#d4875a"]].map(([v,l,ico,col])=>(
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
                const TIPS = [t('dash.tip1',language),t('dash.tip2',language),t('dash.tip3',language),t('dash.tip4',language)];
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
                      <h3 style={{color:"var(--text)",fontSize:14,fontWeight:700,margin:0}}>{t('dash.macroVsPlan',language)}</h3>
                      <button onClick={()=>setSec("statistics")} style={{...GB,fontSize:11,padding:"3px 8px",color:"var(--accent)"}}>{t('dash.editGoals',language)}</button>
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
                const streak = computeWeeklyStreak(cookLog);
                const thisWeek = weekKey(new Date());
                const cookedThisWeek = cookLog.some(l=>weekKey(l.date)===thisWeek);
                return (
                  <div style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised)",borderRadius:14,padding:"14px 18px",marginBottom:24,display:"flex",alignItems:"center",gap:14,borderLeft:"3px solid #ffd580",flexWrap:"wrap"}}>
                    <span style={{fontSize:28}}>🔥</span>
                    <div style={{flex:1,minWidth:160}}>
                      {streak > 0
                        ? <div style={{color:"#ffd580",fontWeight:800,fontSize:20}}>{streak} week{streak!==1?"s":""} streak!</div>
                        : <div style={{color:"var(--text-sub)",fontWeight:700,fontSize:16}}>{t('dash.startStreak',language)}</div>}
                      <div style={{color:"var(--text-sub)",fontSize:12,marginTop:2}}>
                        {cookedThisWeek ? t('dash.cookedSafe',language) : t('dash.cookWeek',language)}
                      </div>
                      <div style={{color:"var(--text-muted)",fontSize:11,marginTop:2}}>{t('dash.totalSessions',language,{n:String(cookLog.length)})}</div>
                    </div>
                    <button onClick={()=>setComfortModalOpen(true)}
                      style={{background:"rgba(255,213,128,0.15)",border:"1px solid rgba(255,213,128,0.35)",borderRadius:10,color:"#ffd580",padding:"7px 14px",fontSize:12,cursor:"pointer",fontFamily:"inherit",fontWeight:700,whiteSpace:"nowrap",flexShrink:0}}>
                      {t('dash.logComfort',language)}
                    </button>
                  </div>
                );
              })()}

              <h3 style={{color:"var(--text)",fontSize:14,fontWeight:700,marginBottom:14}}>{t('dash.recentRecipes',language)}</h3>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:18,marginBottom:28}}>
                {recipes.slice(-4).reverse().map(r=>(
                  <RecipeCard key={r.id} recipe={dr(r)} onClick={()=>setViewing(dr(r))} onFavorite={toggleFav} isFavorite={isFav(r)} language={language}/>
                ))}
              </div>
              {/* Recipe Resources */}
              {(()=>{
                const RESOURCES = [
                  {name:"EatingWell",        url:"https://www.eatingwell.com/recipes/",         emoji:"🥗", desc:"Healthy recipes for every diet"},
                  {name:"Skinnytaste",       url:"https://www.skinnytaste.com/recipes/",         emoji:"⚖️", desc:"Lightened-up comfort food"},
                  {name:"Minimalist Baker",  url:"https://minimalistbaker.com/",                 emoji:"🌿", desc:"Simple recipes with 10 ingredients or less"},
                  {name:"Love & Lemons",     url:"https://www.loveandlemons.com/recipes/",       emoji:"🍋", desc:"Fresh vegetarian & vegan recipes"},
                  {name:"Cookie and Kate",   url:"https://cookieandkate.com/",                   emoji:"🌾", desc:"Whole foods, vegetarian cooking"},
                  {name:"Budget Bytes",      url:"https://www.budgetbytes.com/",                 emoji:"💰", desc:"Delicious meals on a budget"},
                  {name:"Feel Good Foodie",  url:"https://feelgoodfoodie.net/recipe/",           emoji:"✨", desc:"Clean & wholesome family recipes"},
                  {name:"Forks Over Knives", url:"https://www.forksoverknives.com/recipes/",     emoji:"🌱", desc:"Plant-based whole-food recipes"},
                ];
                return (
                  <div style={{marginBottom:28}}>
                    <h3 style={{color:"var(--accent)",fontSize:14,fontWeight:700,marginBottom:4}}>{t('dash.resources',language)}</h3>
                    <p style={{color:"var(--text-sub)",fontSize:12,marginBottom:14}}>{t('dash.resourcesDesc',language)}</p>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10}}>
                      {RESOURCES.map(r=>(
                        <a key={r.name} href={r.url} target="_blank" rel="noopener noreferrer"
                          style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:"var(--bg-card)",borderRadius:12,border:"1px solid var(--border)",textDecoration:"none",transition:"border-color .15s,transform .15s"}}
                          onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(90,173,142,0.5)";e.currentTarget.style.transform="translateY(-2px)";}}
                          onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.transform="none";}}>
                          <span style={{fontSize:24,flexShrink:0}}>{r.emoji}</span>
                          <div style={{minWidth:0}}>
                            <div style={{fontSize:13,fontWeight:700,color:"var(--text)",marginBottom:2}}>{r.name}</div>
                            <div style={{fontSize:11,color:"var(--text-muted)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.desc}</div>
                          </div>
                          <span style={{marginLeft:"auto",fontSize:14,color:"var(--text-muted)",flexShrink:0}}>↗</span>
                        </a>
                      ))}
                    </div>
                  </div>
                );
              })()}
              {recipes.length===0 && (
                <div style={{textAlign:"center",padding:"48px 0",color:"#5a6a7a"}}>
                  <div style={{fontSize:40,marginBottom:12}}>🥗</div>
                  <div style={{fontSize:15,color:"#8a9bb0",marginBottom:8}}>{t('dash.noRecipes',language)}</div>
                  <button onClick={()=>setAddOpen(true)} style={{background:"linear-gradient(135deg,#3a7d5e,#5aad8e)",border:"none",borderRadius:10,color:"#fff",padding:"10px 20px",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{t('dash.addFirst',language)}</button>
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
                  <h2 style={{color:"var(--text)",fontFamily:"'Playfair Display',serif",margin:0}}>{t('dash.allRecipes',language)}</h2>
                  <span style={{color:"var(--text-muted)",fontSize:12}}>{filtered.length} of {recipes.length}</span>
                </div>
                <div style={{display:"flex",gap:7,flexWrap:"wrap",alignItems:"center"}}>
                  {anyFilterActive && (
                    <button onClick={clearAllFilters} style={{...CB,fontSize:11,color:"#f08080",border:"1px solid rgba(240,128,128,0.3)"}}>{t('dash.clearFilters',language)}</button>
                  )}
                  <button onClick={()=>setBudgetMode(b=>!b)}
                    style={{...CB,fontSize:12,padding:"5px 12px",background:budgetMode?"rgba(90,173,142,0.18)":"var(--bg-card)",color:budgetMode?"#5aad8e":"var(--text-sub)",boxShadow:budgetMode?"var(--nm-inset)":"var(--nm-raised-sm)",border:budgetMode?"1px solid rgba(90,173,142,0.3)":"none"}}>
                    {budgetMode?t('dash.budgetOn',language):t('dash.budgetOff',language)}
                  </button>
                  {recipes.length > 0 && <button onClick={()=>exportMealBookToPDF(recipes.map(dr),"My Recipe Book",language)} style={{...CB,fontSize:12,padding:"6px 13px"}}>{t('dash.exportBook',language)}</button>}
                  {recipes.length > 0 && <button onClick={()=>setAuditOpen(true)} style={{...CB,fontSize:12,padding:"6px 13px",color:"#ffd580"}}>{t('dash.auditRecipes',language)}</button>}
                  <button onClick={()=>setWhatCanICookOpen(true)} style={{...CB,fontSize:12,padding:"6px 13px",color:"#5aad8e"}}>{t('pantry.whatCanICook',language)}</button>
                  <button onClick={()=>setSpinWheelOpen(true)} style={{...CB,fontSize:12,padding:"6px 13px",color:"#c06090"}}>{t('dash.spin',language)}</button>
                  <button onClick={()=>setRemixOpen(true)} style={{...CB,fontSize:12,padding:"6px 13px",color:"#c8a8ff"}}>{t('dash.remix',language)}</button>
                  <button onClick={()=>setAddOpen(true)} style={{background:"linear-gradient(135deg,#3a7d5e,#5aad8e)",border:"none",borderRadius:9,color:"#fff",padding:"8px 16px",fontWeight:700,cursor:"pointer",fontFamily:"inherit",fontSize:13}}>{t('dash.addRecipe',language)}</button>
                </div>
              </div>

              {/* Budget mode panel */}
              {budgetMode && (
                <div style={{background:"rgba(90,173,142,0.07)",border:"1px solid rgba(90,173,142,0.25)",borderRadius:14,padding:"12px 16px",marginBottom:14,display:"flex",gap:16,flexWrap:"wrap",alignItems:"center"}}>
                  <span style={{fontSize:20}}>💰</span>
                  <div>
                    <div style={{color:"#5aad8e",fontWeight:700,fontSize:13}}>{t('dash.budgetMode',language)}</div>
                    <div style={{color:"var(--text-muted)",fontSize:11}}>{t('dash.budgetDesc',language)}</div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginLeft:"auto"}}>
                    <span style={{color:"var(--text-sub)",fontSize:12}}>{t('dash.weeklyBudget',language)}</span>
                    <input type="number" value={weeklyBudget} onChange={e=>setWeeklyBudget(Math.max(1,+e.target.value))}
                      style={{...IS,width:70,height:32,padding:"0 8px",fontSize:13}}/>
                    <span style={{color:"var(--text-muted)",fontSize:11}}>{t('dash.perWeek',language)}</span>
                  </div>
                  <div style={{color:"var(--text-muted)",fontSize:11}}>~${(weeklyBudget/21).toFixed(2)}/meal max</div>
                </div>
              )}

              {/* Translation progress / no-key warning */}
              {language !== 'en' && !anthropicKey && !pwaGet('anthropic_key') && (
                <div style={{display:"flex",alignItems:"center",gap:8,padding:"7px 14px",marginBottom:8,background:"rgba(240,128,128,0.1)",border:"1px solid rgba(240,128,128,0.3)",borderRadius:10,fontSize:12,color:"#f08080",cursor:"pointer"}} onClick={()=>setSettingsOpen(true)}>
                  ⚠ {language==='es'?'La traducción de recetas requiere una clave API de Anthropic. Toca ⚙️ para añadirla.':language==='ru'?'Для перевода рецептов нужен API-ключ Anthropic. Нажмите ⚙️ чтобы добавить.':'Recipe translation requires an Anthropic API key. Tap ⚙️ Settings to add it.'}
                </div>
              )}

              {/* Category filter */}
              <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
                {CATEGORIES.map(c=>(
                  <button key={c.id} onClick={()=>setCatF(c.id)}
                    style={{...CB,boxShadow:catF===c.id?"var(--nm-inset)":"var(--nm-raised-sm)",color:catF===c.id?"var(--accent)":"var(--text-sub)",padding:"6px 14px"}}>
                    {c.icon} {getCategoryLabel(c.id, language)}
                  </button>
                ))}
              </div>

              {/* Diet tag filter */}
              <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:6}}>
                {DIET_TAGS.map(tag=>(
                  <button key={tag} onClick={()=>setTagF(tagF===tag?null:tag)}
                    style={{...CB,boxShadow:tagF===tag?"var(--nm-inset)":"var(--nm-raised-sm)",color:tagF===tag?(TAG_COLORS[tag]||"var(--accent)"):"var(--text-sub)"}}>
                    {t(TAG_KEYS[tag]||tag, language)}
                  </button>
                ))}
              </div>

              {/* Health tag filter */}
              <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:6}}>
                {HEALTH_TAGS.map(tag=>(
                  <button key={tag} onClick={()=>setHealthF(healthF===tag?null:tag)}
                    style={{...CB,boxShadow:healthF===tag?"var(--nm-inset)":"var(--nm-raised-sm)",color:healthF===tag?(HEALTH_COLORS[tag]||"var(--accent)"):"var(--text-sub)"}}>
                    {t(TAG_KEYS[tag]||tag, language)}
                  </button>
                ))}
              </div>

              {/* Difficulty + Time + Budget filters */}
              <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:6,alignItems:"center"}}>
                <span style={{color:"var(--text-muted)",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:.8,marginRight:2}}>{t('filter.difficulty',language)}</span>
                {[null,"beginner","intermediate","advanced"].map(d=>(
                  <button key={d||"all"} onClick={()=>setDiffF(diffF===d?null:d)}
                    style={{...CB,boxShadow:diffF===d&&d?"var(--nm-inset)":"var(--nm-raised-sm)",color:diffF===d&&d?(DIFFICULTIES[d]?.color||"var(--accent)"):"var(--text-sub)",fontSize:11}}>
                    {d?DIFFICULTIES[d].icon+" "+t('diff.'+d,language):t('filter.all',language)}
                  </button>
                ))}
                <span style={{color:"var(--text-muted)",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:.8,margin:"0 2px 0 10px"}}>{t('filter.time',language)}</span>
                {([[null,t('filter.any',language)],[15,"≤15m"],[30,"≤30m"],[60,"≤1hr"]] as [any,string][]).map(([val,label])=>(
                  <button key={label} onClick={()=>setMaxTimeF(maxTimeF===val?null:val)}
                    style={{...CB,boxShadow:maxTimeF===val&&val!==null?"var(--nm-inset)":"var(--nm-raised-sm)",color:maxTimeF===val&&val!==null?"var(--accent)":"var(--text-sub)",fontSize:11}}>
                    {label}
                  </button>
                ))}
                <span style={{color:"var(--text-muted)",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:.8,margin:"0 2px 0 10px"}}>{t('filter.budget',language)}</span>
                {([[null,t('filter.any',language)],[2,"≤$2"],[4,"≤$4"],[6,"≤$6"]] as [any,string][]).map(([val,label])=>(
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

              {/* Appliance filter */}
              <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:6,alignItems:"center"}}>
                <span style={{color:"var(--text-muted)",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:.8,marginRight:2}}>{t('filter.appliance',language)}</span>
                {EQUIPMENT_LIST.filter(a=>a!=="none").map(a=>{
                  const on = applianceF.includes(a);
                  return (
                    <button key={a} onClick={()=>setApplianceF(f=>on?f.filter(x=>x!==a):[...f,a])}
                      style={{...CB,boxShadow:on?"var(--nm-inset)":"var(--nm-raised-sm)",color:on?"var(--accent)":"var(--text-sub)",fontSize:11,fontWeight:on?700:400}}>
                      {APPLIANCE_ICONS[a]||"🔧"} {t(APPLIANCE_KEYS[a]||a, language)}
                    </button>
                  );
                })}
                {applianceF.length > 0 && <button onClick={()=>setApplianceF([])} style={{...CB,fontSize:10,color:"var(--text-muted)"}}>{t('filter.clear',language)}</button>}
              </div>

              <div style={{height:12}}/>

              {filtered.length===0
                ? <div style={{textAlign:"center",padding:"48px 0",color:"#5a6a7a"}}>
                    <div style={{fontSize:36,marginBottom:10}}>🔍</div>
                    <div style={{marginBottom:12}}>{t('dash.noMatches',language)}</div>
                    {anyFilterActive && <button onClick={clearAllFilters} style={{...CB,color:"var(--accent)"}}>{t('dash.clearAll',language)}</button>}
                  </div>
                : <div className="r-grid">
                    {filtered.map(r=><RecipeCard key={r.id} recipe={dr(r)} onClick={()=>setViewing(dr(r))} onFavorite={toggleFav} isFavorite={isFav(r)} costPerServing={budgetMode?recipeEstCost(r):undefined} language={language}/>)}
                  </div>
              }
            </div>
          )}

          {sec==="mix-match" && <MixMatch recipes={recipes} onAddToMealPlan={item=>setMealPlanItems(p=>[...p,item])} onSaveAsRecipe={r=>setRecipes(p=>[...p,r])} language={language}/>}

          {sec==="meal-plan" && <MealPlanManager recipes={recipes} mealPlanItems={mealPlanItems} setMealPlanItems={setMealPlanItems} onGoShopping={()=>setSec("shopping")} language={language} translatedRecipes={translatedRecipes}/>}

          {sec==="shopping" && <ShoppingList mealPlanItems={mealPlanItems} recipes={recipes} spends={shoppingSpends} onLogSpend={s=>setShoppingSpends(p=>[...p,s])} weeklyBudget={budgetMode?weeklyBudget:null} pantry={pantry} language={language} translatedRecipes={translatedRecipes}/>}
          {sec==="pantry" && <PantryManager pantry={pantry} setPantry={setPantry} recipes={recipes} language={language} onDeduct={updates=>setPantry(p=>p.map(item=>{const u=updates.find(x=>x.id===item.id);return u?{...item,amount:Math.max(0,item.amount-u.used)}:item;}))}/>}

          {sec==="gallery" && <PhotoGallery recipes={recipes} onView={setViewing} language={language}/>}

          {sec==="supplements" && (
            <div>
              <ProfileSelector profiles={profiles} activeProfileId={activeProfileId} setActiveProfileId={setActiveProfileId} addProfile={addProfile} deleteProfile={deleteProfile} renameProfile={renameProfile}/>
              <SupplementTracker supplements={supplements} setSupplements={setSupplements} language={language}/>
            </div>
          )}

          {sec==="statistics" && <StatisticsPanel recipes={recipes} mealPlanItems={mealPlanItems} ratings={ratings} favorites={favorites} shoppingSpends={shoppingSpends} cookLog={cookLog} macroGoals={macroGoals} setMacroGoals={setMacroGoals} onDeleteSpend={id=>setShoppingSpends(p=>p.filter(s=>s.id!==id))} language={language} profileSelector={<ProfileSelector profiles={profiles} activeProfileId={activeProfileId} setActiveProfileId={setActiveProfileId} addProfile={addProfile} deleteProfile={deleteProfile} renameProfile={renameProfile}/>}/>}

          {sec==="optimizer" && <MealPrepOptimizer recipes={recipes} onAddToMealPlan={item=>setMealPlanItems(p=>[...p,item])} language={language}/>}

          {sec==="ingredient-search" && <IngredientSearch recipes={recipes} onView={setViewing} language={language} translatedRecipes={translatedRecipes}/>}

          {sec==="favorites" && <FavoritesView favorites={favorites} recipes={recipes} setFavorites={setFavorites} onView={setViewing} language={language} translatedRecipes={translatedRecipes}/>}

          {sec==="settings" && (
            <div style={{maxWidth:560,margin:"0 auto"}}>
              <h2 style={{color:"var(--text)",fontFamily:"'Playfair Display',serif",marginBottom:6}}>⚙️ {t('settings.title',language)}</h2>
              <p style={{color:"var(--text-sub)",fontSize:14,marginBottom:24}}>{t('settings.settingsDesc',language)}</p>

              {/* Language */}
              <div style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised)",borderRadius:18,padding:24,marginBottom:20}}>
                <h3 style={{color:"var(--text)",fontSize:15,fontWeight:700,marginBottom:4,marginTop:0}}>🌐 Language</h3>
                <p style={{color:"var(--text-muted)",fontSize:13,marginBottom:14,marginTop:0}}>{t('settings.languageDesc',language)}</p>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                  {[["en","English","EN"],["es","Español","ES"],["ru","Русский","RU"]].map(([code,label,badge])=>(
                    <button key={code} onClick={()=>setLanguage(code)}
                      style={{...GB,padding:"14px 12px",flexDirection:"column",display:"flex",alignItems:"center",gap:6,
                        background:language===code?"rgba(58,125,94,0.22)":"var(--bg-card)",
                        boxShadow:language===code?"var(--nm-inset)":"var(--nm-raised-sm)",
                        color:language===code?"var(--accent)":"var(--text-sub)",
                        border:language===code?"1px solid var(--accent)":"1px solid transparent",borderRadius:14,fontWeight:language===code?700:400}}>
                      <span style={{fontSize:18,fontWeight:800,letterSpacing:1,fontFamily:"monospace"}}>{badge}</span>
                      <span style={{fontSize:13}}>{label}</span>
                      {language===code && <span style={{fontSize:10,color:"var(--accent)"}}>{t('settings.langActive',language)}</span>}
                    </button>
                  ))}
                </div>
                {language!=="en" && <div style={{marginTop:14,background:"rgba(58,125,94,0.1)",border:"1px solid rgba(58,125,94,0.2)",borderRadius:10,padding:"10px 14px",color:"var(--accent)",fontSize:12}}>
                  {t('settings.langHint',language,{lang:({es:"Spanish",ru:"Russian"}[language])})}
                </div>}
              </div>

              {/* Appearance */}
              <div style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised)",borderRadius:18,padding:24,marginBottom:20}}>
                <h3 style={{color:"var(--text)",fontSize:15,fontWeight:700,marginBottom:4,marginTop:0}}>{t('settings.appearance',language)}</h3>
                <p style={{color:"var(--text-muted)",fontSize:13,marginBottom:14,marginTop:0}}>{t('settings.appearanceDesc',language)}</p>
                <div style={{display:"flex",gap:10}}>
                  {([[true,"🌙 "+t('settings.dark',language)],[false,"☀️ "+t('settings.light',language)]] as [boolean,string][]).map(([val,label])=>(
                    <button key={String(val)} onClick={()=>toggleDark()} style={{...GB,flex:1,padding:"12px 0",
                      background:darkMode===val?"rgba(58,125,94,0.22)":"var(--bg-card)",
                      boxShadow:darkMode===val?"var(--nm-inset)":"var(--nm-raised-sm)",
                      color:darkMode===val?"var(--accent)":"var(--text-sub)",
                      border:darkMode===val?"1px solid var(--accent)":"1px solid transparent",borderRadius:12,fontWeight:darkMode===val?700:400,fontSize:14}}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* API Keys */}
              <div style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised)",borderRadius:18,padding:24,marginBottom:20}}>
                <h3 style={{color:"var(--text)",fontSize:15,fontWeight:700,marginBottom:4,marginTop:0}}>{t('settings.aiKeys',language)}</h3>
                <div style={{marginBottom:16}}>
                  <div style={{color:"var(--text-sub)",fontSize:11,fontWeight:700,marginBottom:8,textTransform:"uppercase",letterSpacing:.8}}>{t('settings.anthropicKeyLabel',language)} <span style={{color:"#f08080"}}>{t('settings.anthropicRequired',language)}</span></div>
                  <input type="password" placeholder="sk-ant-api03-…" value={anthropicKey}
                    onChange={e=>{setAnthropicKey(e.target.value);pwaSet('anthropic_key',e.target.value);}}
                    style={{...IS,fontSize:14,marginBottom:8}}/>
                  {anthropicKey
                    ? <div style={{color:"var(--accent)",fontSize:12}}>{t('settings.aiEnabled',language)}</div>
                    : <div style={{color:"var(--text-sub)",fontSize:12}}>{t('settings.anthropicFree',language)}</div>}
                </div>
                <div>
                  <div style={{color:"var(--text-sub)",fontSize:11,fontWeight:700,marginBottom:8,textTransform:"uppercase",letterSpacing:.8}}>{t('settings.pexelsKey',language)} <span style={{color:"var(--text-muted)"}}>{t('settings.pexelsOptional',language)}</span></div>
                  <input type="password" placeholder="Pexels API key…" value={pexelsKey}
                    onChange={e=>{setPexelsKey(e.target.value);pwaSet('pexels_key',e.target.value);}}
                    style={{...IS,fontSize:14,marginBottom:8}}/>
                  {pexelsKey
                    ? <div style={{color:"var(--accent)",fontSize:12}}>{t('settings.photosEnabled',language)}</div>
                    : <div style={{color:"var(--text-sub)",fontSize:12}}>{t('settings.pexelsFree',language)}</div>}
                </div>
              </div>

              {/* Data */}
              <div style={{background:"var(--bg-card)",boxShadow:"var(--nm-raised)",borderRadius:18,padding:24}}>
                <h3 style={{color:"var(--text)",fontSize:15,fontWeight:700,marginBottom:4,marginTop:0}}>{t('settings.dataBackup',language)}</h3>
                <p style={{color:"var(--text-muted)",fontSize:13,marginBottom:14,marginTop:0}}>{t('settings.backupDesc',language)}</p>
                <div style={{display:"flex",gap:10}}>
                  <button onClick={exportData} style={{...GB,flex:1,fontSize:13,padding:"11px 0"}}>{t('settings.export',language)}</button>
                  <label style={{...GB,flex:1,fontSize:13,padding:"11px 0",textAlign:"center",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    {t('settings.importBackup',language)}
                    <input type="file" accept=".json" style={{display:"none"}} onChange={importData}/>
                  </label>
                </div>
              </div>
            </div>
          )}
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
          onIngredientTap={name=>setWikiIngredient(name)}
          language={language}
          onTranslated={translated=>{setViewing(translated);setTranslatedRecipes(p=>({...p,[translated.id]:translated}));}}
          onMarkCooked={r=>setCookLog(p=>[...p,{id:Date.now(),recipeId:r.id,recipeName:r.title,date:new Date().toISOString()}])}/>
      )}
      {wikiIngredient && <IngredientWikiModal ingredient={wikiIngredient} onClose={()=>setWikiIngredient(null)} language={language}/>}
      {spinWheelOpen && <SpinWheelModal recipes={recipes} onClose={()=>setSpinWheelOpen(false)} onView={r=>{setViewing(r);setSpinWheelOpen(false);}} language={language}/>}
      {remixOpen && <RecipeRemixModal recipes={recipes} onClose={()=>setRemixOpen(false)} onAdd={r=>setRecipes(p=>[...p,r])} language={language}/>}
      {addOpen && <SmartAddModal initialUrl={addInitialUrl} onClose={()=>{setAddOpen(false);setAddInitialUrl("");}} onAdd={r=>setRecipes(p=>[...p,r])} language={language}/>}

      {/* Comfort meal log modal */}
      {comfortModalOpen && <ComfortMealModal onClose={()=>setComfortModalOpen(false)} onLog={(name,notes)=>setCookLog(p=>[...p,{id:Date.now(),recipeName:name,date:new Date().toISOString(),isComfortMeal:true,notes}])} language={language}/>}

      {/* Recipe audit modal */}
      {auditOpen && <RecipeAuditModal recipes={recipes} onClose={()=>setAuditOpen(false)} onSave={updated=>setRecipes(p=>p.map(r=>r.id===updated.id?updated:r))}/>}
      {whatCanICookOpen && <WhatCanICookModal recipes={recipes} pantry={pantry} onClose={()=>setWhatCanICookOpen(false)} onView={r=>{setViewing(r);setWhatCanICookOpen(false);}} language={language}/>}
      {editTarget && <EditRecipeModal recipe={editTarget} onClose={()=>setEditTarget(null)} language={language}
        onSave={updated=>{setRecipes(p=>p.map(r=>r.id===updated.id?updated:r));setViewing(updated);setEditTarget(null);}}
        onDelete={id=>{trackDeleted(id,recipes);setRecipes(p=>p.filter(r=>r.id!==id));setViewing(null);setEditTarget(null);}}/>}
      {ratingTarget && <RatingModal recipe={ratingTarget} existing={ratings[ratingTarget.id]} onSave={(id,r)=>setRatings(p=>({...p,[id]:r}))} onClose={()=>setRatingTarget(null)} language={language}/>}

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
