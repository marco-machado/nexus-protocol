import {
  AUG_DEFS,
  augsUnlocked,
  AUG_PTS,
  buildSpec,
  campaignWon,
  clearSave,
  loadMeta,
  newAgent,
  saveMeta,
  T2_WEAPON_PTS,
  weaponsUnlocked,
  type DebriefInfo,
  type MetaState,
  type Territory,
} from './meta';
import { WEAPONS } from '../sim/weapons';

const GEAR = {
  persuadertron: { name: 'Persuadertron', price: 500 },
  armor: { name: 'Body Armor', price: 400 },
  medkit: { name: 'Medkit', price: 100 },
};
const RECRUIT_COST = 800;

export class Screens {
  private el: HTMLElement;
  private selAgent = 0;

  constructor(el: HTMLElement) {
    this.el = el;
  }

  show(): void {
    this.el.style.display = 'flex';
  }

  hide(): void {
    this.el.style.display = 'none';
    this.el.innerHTML = '';
  }

  menu(onStart: (fresh: boolean) => void): void {
    const hasSave = loadMeta() !== null;
    this.show();
    this.el.innerHTML = `
      <div class="panel menu">
        <h1>NEXUS<span>PROTOCOL</span></h1>
        <p class="tag">Corporate acquisitions. Kinetic division.</p>
        ${hasSave ? '<button data-act="continue">RESUME OPERATIONS</button>' : ''}
        <button data-act="new">NEW OPERATION</button>
        <p class="fine">Nexus Corp is an equal-opportunity employer. Asset attrition figures available on request.</p>
      </div>`;
    this.el.onclick = (e) => {
      const act = (e.target as HTMLElement).dataset.act;
      if (act === 'new') {
        clearSave();
        onStart(true);
      } else if (act === 'continue') {
        onStart(false);
      }
    };
  }

  worldMap(m: MetaState, onContract: (t: Territory) => void): void {
    this.show();
    const terr = m.territories
      .map((t) => {
        const owner = t.owned ? '<b class="own">NEXUS</b>' : '<b class="riv">RIVAL</b>';
        const body = t.owned
          ? `<div>Income share <b>${Math.round((t.baseIncome * t.taxRate) / 100)}cr</b>/cycle</div>
             <div class="taxrow">Tax <input type="range" min="10" max="50" step="5" value="${t.taxRate}" data-tax="${t.id}"/> <b>${t.taxRate}%</b></div>
             <div>Unrest <span class="unrest ${t.unrest > 60 ? 'hot' : ''}">${t.unrest}</span>/100</div>`
          : `<div>Est. income <b>${t.baseIncome}cr</b> base</div>
             <div>Contract: <b>${['ASSASSINATION', 'ACQUISITION (PERSUADE)', 'ASSET RAID'][t.missionType]}</b></div>
             <button data-contract="${t.id}">OPEN CONTRACT</button>`;
        return `<div class="terr ${t.owned ? 'owned' : ''}"><h3>${t.name} ${owner}</h3>${body}</div>`;
      })
      .join('');
    const research = `
      <div class="research">
        <h3>R&amp;D ALLOCATION</h3>
        <div class="taxrow">Weapons <input type="range" min="0" max="100" step="10" value="${m.researchSplit}" data-split="1"/> Augments</div>
        <div>Weapons tier 2: <progress value="${Math.min(m.weaponPts, T2_WEAPON_PTS)}" max="${T2_WEAPON_PTS}"></progress> ${weaponsUnlocked(m) ? 'ONLINE' : `${m.weaponPts}/${T2_WEAPON_PTS}`}</div>
        <div>Augmentation V1: <progress value="${Math.min(m.augPts, AUG_PTS)}" max="${AUG_PTS}"></progress> ${augsUnlocked(m) ? 'ONLINE' : `${m.augPts}/${AUG_PTS}`}</div>
      </div>`;
    this.el.innerHTML = `
      <div class="panel map">
        <div class="topbar"><h2>GLOBAL OPERATIONS</h2><span class="credits">${m.credits}cr</span><span>CYCLE ${m.cycle}</span></div>
        <div class="terrgrid">${terr}</div>
        ${research}
        <div class="loglines">${m.log.slice(0, 4).map((l) => `<div>&gt; ${l}</div>`).join('')}</div>
      </div>`;
    this.el.onclick = (e) => {
      const id = (e.target as HTMLElement).dataset.contract;
      if (id !== undefined) onContract(m.territories[Number(id)]!);
    };
    this.el.oninput = (e) => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.tax !== undefined) {
        m.territories[Number(t.dataset.tax)]!.taxRate = Number(t.value);
        saveMeta(m);
        this.worldMap(m, onContract);
      } else if (t.dataset.split !== undefined) {
        m.researchSplit = Number(t.value);
        saveMeta(m);
      }
    };
  }

  equip(m: MetaState, t: Territory, onLaunch: () => void, onBack: () => void): void {
    this.show();
    const wpnRows = WEAPONS.map((w) => {
      const locked = w.tier > 1 && !weaponsUnlocked(m);
      const owned = m.arsenal[w.id] ?? 0;
      return `<div class="row">
        <span>${w.name} <small>T${w.tier} dmg${w.damage}${w.pellets > 1 ? 'x' + w.pellets : ''} rng${w.range}</small></span>
        <span>x${owned}</span>
        ${locked ? '<i>R&amp;D REQUIRED</i>' : `<button data-buy="${w.id}" ${m.credits < w.price ? 'disabled' : ''}>BUY ${w.price}</button>`}
        <button data-give="${w.id}" ${owned <= 0 ? 'disabled' : ''}>EQUIP</button>
      </div>`;
    }).join('');
    const gearRows = `
      <div class="row"><span>Persuadertron</span><span>x${m.persuadertrons}</span>
        <button data-buygear="persuadertron" ${m.credits < GEAR.persuadertron.price ? 'disabled' : ''}>BUY ${GEAR.persuadertron.price}</button>
        <button data-givegear="persuadertron" ${m.persuadertrons <= 0 ? 'disabled' : ''}>EQUIP</button></div>
      <div class="row"><span>Body Armor <small>+60 HP</small></span><span>x${m.armors}</span>
        <button data-buygear="armor" ${m.credits < GEAR.armor.price ? 'disabled' : ''}>BUY ${GEAR.armor.price}</button>
        <button data-givegear="armor" ${m.armors <= 0 ? 'disabled' : ''}>EQUIP</button></div>
      <div class="row"><span>Medkit <small>auto-heal</small></span><span></span>
        <button data-buygear="medkit" ${m.credits < GEAR.medkit.price ? 'disabled' : ''}>BUY ${GEAR.medkit.price} (sel. agent)</button><span></span></div>`;
    const augRows = augsUnlocked(m)
      ? AUG_DEFS.map(
          (d) => `<div class="row"><span>${d.name} <small>${d.desc}</small></span><span></span>
            <button data-aug="${d.key}" ${m.credits < d.price ? 'disabled' : ''}>INSTALL ${d.price} (sel. agent)</button><span></span></div>`,
        ).join('')
      : '<div class="row"><i>Augmentation research incomplete.</i></div>';

    const agents = m.agents
      .map((a, i) => {
        const spec = buildSpec(a);
        if (!a.alive) {
          return `<div class="acard dead ${i === this.selAgent ? 'sel' : ''}" data-agent="${i}">
            <h4>${a.name} - WRITTEN OFF</h4>
            <button data-recruit="${i}" ${m.credits < RECRUIT_COST ? 'disabled' : ''}>DECANT REPLACEMENT ${RECRUIT_COST}cr</button>
          </div>`;
        }
        const load = a.loadout
          .map((wid, li) => `<span class="chip">${WEAPONS[wid]!.name}<b data-drop="${li}">x</b></span>`)
          .join('');
        return `<div class="acard ${i === this.selAgent ? 'sel' : ''}" data-agent="${i}">
          <h4>${a.name}</h4>
          <small>HP ${spec.maxHp} | missions ${a.missions} | kills ${a.kills}</small>
          <div>${load || '<i>unarmed</i>'}</div>
          <div class="chips">${a.gear.persuadertron ? '<span class="chip cyan">Persuadertron<b data-dropgear="persuadertron">x</b></span>' : ''}${a.gear.armor ? '<span class="chip">Armor<b data-dropgear="armor">x</b></span>' : ''}<span class="chip">Medkit x${a.gear.medkits}</span></div>
          <small>${a.augments.map((k) => AUG_DEFS.find((d) => d.key === k)!.name).join(', ') || 'no augments'}</small>
        </div>`;
      })
      .join('');

    this.el.innerHTML = `
      <div class="panel equip">
        <div class="topbar"><h2>SQUAD PROVISIONING - ${t.name}</h2><span class="credits">${m.credits}cr</span></div>
        <div class="cols">
          <div class="col"><h3>SQUAD (click to select)</h3>${agents}</div>
          <div class="col"><h3>ARMORY</h3>${wpnRows}<h3>EQUIPMENT</h3>${gearRows}<h3>AUGMENTATION</h3>${augRows}</div>
        </div>
        <div class="btnrow"><button data-act="back">BACK</button><button class="primary" data-act="launch">LAUNCH CONTRACT</button></div>
      </div>`;

    const rerender = () => {
      saveMeta(m);
      this.equip(m, t, onLaunch, onBack);
    };
    this.el.onclick = (e) => {
      const d = (e.target as HTMLElement).dataset;
      const sel = m.agents[this.selAgent]!;
      if (d.agent !== undefined && d.recruit === undefined && d.drop === undefined && d.dropgear === undefined) {
        this.selAgent = Number(d.agent);
        rerender();
      } else if (d.act === 'back') onBack();
      else if (d.act === 'launch') onLaunch();
      else if (d.buy !== undefined) {
        const w = WEAPONS[Number(d.buy)]!;
        if (m.credits >= w.price) {
          m.credits -= w.price;
          m.arsenal[w.id] = (m.arsenal[w.id] ?? 0) + 1;
          rerender();
        }
      } else if (d.give !== undefined) {
        const wid = Number(d.give);
        if ((m.arsenal[wid] ?? 0) > 0 && sel.alive && sel.loadout.length < 8) {
          m.arsenal[wid]!--;
          sel.loadout.push(wid);
          rerender();
        }
      } else if (d.drop !== undefined) {
        const li = Number(d.drop);
        const wid = sel.loadout[li];
        if (wid !== undefined) {
          sel.loadout.splice(li, 1);
          m.arsenal[wid] = (m.arsenal[wid] ?? 0) + 1;
          rerender();
        }
      } else if (d.buygear !== undefined) {
        const g = d.buygear as keyof typeof GEAR;
        if (m.credits >= GEAR[g].price) {
          m.credits -= GEAR[g].price;
          if (g === 'persuadertron') m.persuadertrons++;
          else if (g === 'armor') m.armors++;
          else if (sel.alive) sel.gear.medkits++;
          rerender();
        }
      } else if (d.givegear !== undefined) {
        if (d.givegear === 'persuadertron' && m.persuadertrons > 0 && sel.alive && !sel.gear.persuadertron) {
          m.persuadertrons--;
          sel.gear.persuadertron = true;
          rerender();
        } else if (d.givegear === 'armor' && m.armors > 0 && sel.alive && !sel.gear.armor) {
          m.armors--;
          sel.gear.armor = true;
          rerender();
        }
      } else if (d.dropgear !== undefined) {
        if (d.dropgear === 'persuadertron' && sel.gear.persuadertron) {
          sel.gear.persuadertron = false;
          m.persuadertrons++;
          rerender();
        } else if (d.dropgear === 'armor' && sel.gear.armor) {
          sel.gear.armor = false;
          m.armors++;
          rerender();
        }
      } else if (d.aug !== undefined) {
        const def = AUG_DEFS.find((a) => a.key === d.aug)!;
        if (sel.alive && m.credits >= def.price && !sel.augments.includes(def.key)) {
          m.credits -= def.price;
          sel.augments.push(def.key);
          rerender();
        }
      } else if (d.recruit !== undefined) {
        const idx = Number(d.recruit);
        if (m.credits >= RECRUIT_COST) {
          m.credits -= RECRUIT_COST;
          m.agents[idx] = newAgent(idx + m.cycle);
          rerender();
        }
      }
    };
  }

  debrief(info: DebriefInfo, m: MetaState, onContinue: () => void): void {
    this.show();
    const verdict = info.won ? 'CONTRACT FULFILLED' : 'CONTRACT UNFULFILLED';
    this.el.innerHTML = `
      <div class="panel debrief">
        <h2 class="${info.won ? 'good' : 'bad'}">${verdict}</h2>
        <div class="loglines">
          ${info.lines.map((l) => `<div>&gt; ${l}</div>`).join('')}
          <div>&gt; Territory income posted: ${info.income}cr</div>
          ${info.salvage ? `<div>&gt; Augment salvage: +${info.salvage}cr</div>` : ''}
        </div>
        <div class="topbar"><span class="credits">BALANCE ${m.credits}cr</span></div>
        <button class="primary" data-act="continue">${campaignWon(m) ? 'FINALIZE REGION' : 'RETURN TO OPERATIONS'}</button>
      </div>`;
    this.el.onclick = (e) => {
      if ((e.target as HTMLElement).dataset.act === 'continue') onContinue();
    };
  }

  victory(m: MetaState, onNewGame: () => void): void {
    this.show();
    this.el.innerHTML = `
      <div class="panel menu">
        <h1>REGION<span>SECURED</span></h1>
        <p class="tag">All five districts under Nexus management. The board is... satisfied. For now.</p>
        <div class="loglines">${m.log.slice(0, 6).map((l) => `<div>&gt; ${l}</div>`).join('')}</div>
        <button data-act="new">NEW OPERATION</button>
      </div>`;
    this.el.onclick = (e) => {
      if ((e.target as HTMLElement).dataset.act === 'new') {
        clearSave();
        onNewGame();
      }
    };
  }
}
