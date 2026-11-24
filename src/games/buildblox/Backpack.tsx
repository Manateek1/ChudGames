import { useState } from "react";
import { Block, Item, catalog, itemInfo, recipes, toolStats } from "./blocks";
import type { ClientMessage, HudState, Mode, Stack } from "./protocol";

const color = (id: number): string => "#" + itemInfo(id).color.toString(16).padStart(6, "0");

export function ItemIcon({ id }: { id: number }): React.JSX.Element {
  return <span aria-hidden="true" className={"bb-item-icon" + (id >= 128 ? " bb-item-icon-tool" : "")}
    style={{ "--item-color": color(id) } as React.CSSProperties} />;
}

export function Slot({ stack, number, selected, onClick }: {
  stack?: Stack | null;
  number?: number;
  selected?: boolean;
  onClick: () => void;
}): React.JSX.Element {
  const name = stack ? itemInfo(stack.id).name : "Empty slot";
  return <button type="button" className={"bb-slot" + (selected ? " bb-slot-selected" : "")}
    onClick={onClick} aria-label={number ? number + " " + name : name} aria-pressed={Boolean(selected)} title={name}>
    {number && <small>{number}</small>}
    {stack && <ItemIcon id={stack.id} />}
    {stack && stack.count > 1 && <span className="bb-slot-count">{stack.count}</span>}
    {stack?.durability !== undefined && <span className="bb-durability"
      style={{ width: Math.max(0, Math.min(100, stack.durability * 100 / (toolStats[stack.id]?.durability ?? 1))) + "%" }} />}
  </button>;
}

interface Props {
  state: HudState;
  mode: Mode;
  send: (message: ClientMessage) => void;
  close: () => void;
}

export function Backpack({ state, mode, send, close }: Props): React.JSX.Element {
  const [slot, setSlot] = useState<number>();
  const [tab, setTab] = useState<"recipes" | "pattern" | "materials">(mode === "creative" ? "materials" : "recipes");
  const [grid, setGrid] = useState<number[]>(Array(9).fill(0));
  const [ingredient, setIngredient] = useState(0);
  const [search, setSearch] = useState("");
  const size = state.station === "bench" ? 3 : 2;
  const counts = new Map<number, number>();
  for (const stack of state.inventory) {
    if (stack) counts.set(stack.id, (counts.get(stack.id) ?? 0) + stack.count);
  }
  const availableRecipes = recipes.filter((recipe) => state.station === "bench" || !recipe.bench);
  const recipeRows = availableRecipes.filter((recipe) => itemInfo(recipe.result).name.toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) =>
    Number(b.ingredients.every(([id, count]) => (counts.get(id) ?? 0) >= count)) -
    Number(a.ingredients.every(([id, count]) => (counts.get(id) ?? 0) >= count)));
  const materials = catalog.filter((id) => itemInfo(id).name.toLowerCase().includes(search.trim().toLowerCase()));

  return <section className="bb-backpack bb-panel" role="dialog" aria-modal="true" aria-label="Backpack">
    <header className="bb-panel-header">
      <div><p className="bb-kicker">XP {state.xp} {state.armored ? " · Guard coat equipped" : ""}</p><h2>Backpack</h2></div>
      <button type="button" className="bb-secondary" onClick={close}>Close <kbd>E</kbd></button>
    </header>
    <div className="bb-backpack-body">
      <div className="bb-pack-items">
        <h3>Carried items</h3>
        <div className="bb-pack-grid">
          {Array.from({ length: 36 }, (_, index) => <Slot key={index} stack={state.inventory[index]} number={index < 9 ? index + 1 : undefined}
            selected={slot === index} onClick={() => {
              if (tab === "pattern") {
                setIngredient(state.inventory[index]?.id ?? 0);
                setSlot(index);
              } else if (slot === undefined && state.inventory[index]) {
                setSlot(index);
              } else if (slot !== undefined) {
                if (slot !== index) send({ type: "moveSlot", from: slot, to: index });
                setSlot(undefined);
              }
            }} />)}
        </div>
        <p className="bb-muted">{tab === "pattern" ? "Pick an item to use in the grid." : "Select a stack, then pick a slot to move it."}</p>
        {state.station === "furnace" && <div className="bb-station">
          <strong>Kiln</strong>
          <p className="bb-muted">Fire raw materials using timber or cedar boards.</p>
          {(state.stationProgress ?? 0) > 0 && <progress aria-label="Kiln progress" max={1} value={state.stationProgress} />}
          <div className="bb-actions">
            <button className="bb-secondary" type="button" onClick={() => send({ type: "action", action: "smelt", item: Block.CopperOre })}>Fire copper</button>
            <button className="bb-secondary" type="button" onClick={() => send({ type: "action", action: "smelt", item: Block.Sand })}>Fire sand</button>
            <button className="bb-secondary" type="button" onClick={() => send({ type: "action", action: "smelt", item: Block.Soil })}>Fire soil</button>
            <button className="bb-secondary" type="button" onClick={() => send({ type: "action", action: "smelt", item: Item.Ration })}>Cook ration</button>
            <button className="bb-secondary" type="button" disabled={state.stationProgress !== 1} onClick={() => send({ type: "action", action: "smelt" })}>Collect</button>
          </div>
        </div>}
        {state.station === "trader" && <div className="bb-station">
          <strong>Trail trader</strong>
          <div className="bb-actions">
            <button className="bb-secondary" type="button" onClick={() => send({ type: "action", action: "trade", item: Item.Ration })}>Rations · 1 amber</button>
            <button className="bb-secondary" type="button" onClick={() => send({ type: "action", action: "trade", item: Item.CopperIngot })}>Copper · 1 amber</button>
            <button className="bb-secondary" type="button" onClick={() => send({ type: "action", action: "trade", item: Block.Glowstone })}>Lumen · 2 amber</button>
          </div>
        </div>}
        {state.station === "bench" && <div className="bb-station">
          <strong>Workbench</strong>
          <p className="bb-muted">Temper a tool for 6 XP and 1 amber shard.</p>
          <button className="bb-secondary" type="button" onClick={() => send({ type: "action", action: "temper", item: state.inventory[slot ?? state.selected]?.id })}>Temper tool</button>
        </div>}
        <p aria-live="polite" className="bb-inventory-notice">{state.notice}</p>
      </div>
      <div className="bb-workspace">
        <div className="bb-tabs" aria-label="Backpack views">
          <button type="button" aria-pressed={tab === "recipes"} onClick={() => { setTab("recipes"); setSlot(undefined); }}>Recipes</button>
          <button type="button" aria-pressed={tab === "pattern"} onClick={() => { setTab("pattern"); setSlot(undefined); }}>Pattern</button>
          {mode === "creative" && <button type="button" aria-pressed={tab === "materials"} onClick={() => { setTab("materials"); setSlot(undefined); }}>Materials</button>}
        </div>
        {tab !== "pattern" && <input aria-label={tab === "recipes" ? "Find a recipe" : "Find a material"} value={search}
          placeholder={tab === "recipes" ? "Find a recipe" : "Find a material"} onChange={(event) => setSearch(event.target.value)} />}
        {tab === "recipes" && <div className="bb-recipe-list">
          {recipeRows.map((recipe) => {
            const canCraft = recipe.ingredients.every(([id, count]) => (counts.get(id) ?? 0) >= count);
            return <button className="bb-recipe" type="button" key={recipe.id} disabled={!canCraft}
              onClick={() => send({ type: "craft", recipe: recipe.id })}>
              <ItemIcon id={recipe.result} />
              <span><strong>{itemInfo(recipe.result).name}{recipe.count > 1 ? " ×" + recipe.count : ""}</strong>
                <small>{recipe.ingredients.map(([id, count]) => itemInfo(id).name + " ×" + count).join(" · ")}</small>
              </span>
            </button>;
          })}
          {!recipeRows.length && <p className="bb-muted">No matching recipes.</p>}
          {state.station !== "bench" && <p className="bb-muted">Place a workbench and use it for advanced recipes.</p>}
        </div>}
        {tab === "pattern" && <div className="bb-pattern">
          <p className="bb-muted">{size} × {size} {state.station === "bench" ? "workbench" : "field crafting"}</p>
          <div className="bb-pattern-grid" style={{ gridTemplateColumns: "repeat(" + size + ", minmax(0, 3rem))" }}>
            {grid.slice(0, size * size).map((id, index) =>
              <Slot key={index} stack={id ? { id, count: 1 } : null} onClick={() => setGrid((previous) =>
                previous.map((value, cell) => cell === index ? (value === ingredient ? 0 : ingredient) : value))} />)}
          </div>
          <div className="bb-actions">
            <button type="button" className="bb-primary" onClick={() => send({ type: "grid", size, grid: grid.slice(0, size * size) })}>Craft pattern</button>
            <button type="button" className="bb-secondary" onClick={() => setGrid(Array(9).fill(0))}>Clear</button>
          </div>
        </div>}
        {tab === "materials" && <p className="bb-muted">Choose a material for hotbar slot {state.selected + 1}.</p>}
        {tab === "materials" && <div className="bb-material-list">
          {materials.map((id) => <button className="bb-recipe" type="button" key={id} onClick={() => send({ type: "give", item: id })}>
            <ItemIcon id={id} /><strong>{itemInfo(id).name}</strong>
          </button>)}
          {!materials.length && <p className="bb-muted">No matching materials.</p>}
        </div>}
      </div>
    </div>
  </section>;
}
