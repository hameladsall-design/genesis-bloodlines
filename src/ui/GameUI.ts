/**
 * The interface controller.
 *
 * Owns the HUD, the panel launcher, the toast stack and the currently open
 * panel. It reads simulation state and dispatches explicit player actions —
 * it never stores gameplay data of its own.
 */

import type { GameEngine } from '../game/simulation/engine';
import type { ResourceKey } from '../game/simulation/types';
import { formatDate, formatTime } from '../game/simulation/calendar';
import { uiBus } from '../game/simulation/uiBus';
import { t, getLanguage, type Lang } from '../i18n';
import { button, clear, el } from './dom';
import { panelRegistry, sortedPanels, type PanelContext, type PanelDef } from './panels/types';
import './panels/index';

export interface HudStats {
  resources: { key: ResourceKey; label: string; value: number }[];
  food: number;
  foodPerDay: number;
  daysOfFood: number;
  population: number;
  capacity: number;
  baseLevel: number;
  date: string;
  time: string;
}

export class GameUI {
  private root: HTMLElement;
  private engine: GameEngine;
  private lang: Lang;

  private hudEl!: HTMLElement;
  private subbarEl!: HTMLElement;
  private toastEl!: HTMLElement;
  private panelHost!: HTMLElement;

  private openPanelId: string | null = null;
  private currentPanel: PanelDef | null = null;
  private payload: unknown = null;
  private hudStats: HudStats | null = null;
  private unsubscribe: (() => void)[] = [];

  constructor(root: HTMLElement, engine: GameEngine) {
    this.root = root;
    this.engine = engine;
    this.lang = getLanguage();
    this.build();
    this.bind();
    this.refreshHud();
    this.renderLauncher();
  }

  /* ---------------- construction ---------------- */

  private build(): void {
    clear(this.root);

    this.hudEl = el('div', { class: 'hud' });
    this.subbarEl = el('div', { class: 'subbar' });
    this.toastEl = el('div', { class: 'toasts' });
    this.panelHost = el('div', { class: 'panel-host' });

    this.root.appendChild(this.hudEl);
    this.root.appendChild(this.subbarEl);
    this.root.appendChild(this.toastEl);
    this.root.appendChild(this.panelHost);
  }

  private bind(): void {
    const store = this.engine.store;

    this.unsubscribe.push(
      store.on('state:changed', () => this.refreshHud()),
      store.on('notification', (p) => this.pushToast(p.text, p.kind)),
      store.on('character:leveled', (p) => {
        const c = store.getCharacter(p.id);
        if (c) this.pushToast(`${c.firstName} ${c.familyName} بلغ المستوى ${p.level}`, 'info');
      }),
      store.on('time:day', () => {
        if (this.currentPanel) this.rerenderPanel();
      }),
    );

    // World interactions routed from the Phaser scene.
    this.unsubscribe.push(
      uiBus.on('open-character', (p) => this.openPanel('character', p.id)),
      uiBus.on('open-visitor', (p) => this.openPanel('visitor', p.id)),
    );
  }

  destroy(): void {
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];
    clear(this.root);
  }

  /* ---------------- HUD ---------------- */

  refreshHud(): void {
    const state = this.engine.state;
    const store = this.engine.store;
    const daily = store.dailyFoodConsumption();
    const food = store.getResource('food');
    const daysOfFood = daily > 0 ? food / daily : Infinity;

    const resourceLabels: { key: ResourceKey; label: string }[] = [
      { key: 'wood', label: t('res.wood', 'خشب', 'Wood') },
      { key: 'stone', label: t('res.stone', 'حجر', 'Stone') },
      { key: 'iron', label: t('res.iron', 'حديد', 'Iron') },
      { key: 'coins', label: t('res.coins', 'عملات', 'Coins') },
      { key: 'tools', label: t('res.tools', 'أدوات', 'Tools') },
      { key: 'herbs', label: t('res.herbs', 'أعشاب', 'Herbs') },
    ];

    const stats: HudStats = {
      resources: resourceLabels.map((r) => ({ ...r, value: store.getResource(r.key) })),
      food,
      foodPerDay: daily,
      daysOfFood,
      population: store.livingCount(),
      capacity: state.base.capacity,
      baseLevel: state.base.level,
      date: formatDate(state.calendar, this.lang),
      time: formatTime(state.calendar),
    };
    this.hudStats = stats;
    this.renderHud(stats);
  }

  private renderHud(stats: HudStats): void {
    clear(this.hudEl);

    this.hudEl.appendChild(
      el('div', { class: 'hud-group' }, [
        el('span', { class: 'gold', style: 'font-family:var(--font-display);font-size:15px', text: 'GENESIS: BLOODLINES' }),
      ]),
    );
    this.hudEl.appendChild(el('div', { class: 'hud-sep' }));

    for (const res of stats.resources) {
      this.hudEl.appendChild(
        el('div', {
          class: 'hud-stat',
          'data-tip': t('res.tip', 'المخزون الحالي من هذه المادة.', 'Current stock of this material.'),
        }, [
          el('span', { class: 'lbl', text: res.label }),
          el('b', { text: String(Math.floor(res.value)) }),
        ]),
      );
    }

    this.hudEl.appendChild(el('div', { class: 'hud-sep' }));

    const foodClass = stats.daysOfFood <= 0 ? 'hud-stat danger' : stats.daysOfFood <= 2 ? 'hud-stat warn' : 'hud-stat';
    this.hudEl.appendChild(
      el('div', {
        class: foodClass,
        'data-tip': t(
          'hud.food.tip',
          `${stats.food} وحدة طعام، والاستهلاك اليومي ${stats.foodPerDay} وحدة. يكفي نحو ${Math.floor(stats.daysOfFood)} يوم.`,
          `${stats.food} food, ${stats.foodPerDay} consumed per day. Roughly ${Math.floor(stats.daysOfFood)} days left.`,
        ),
      }, [
        el('span', { class: 'lbl', text: t('hud.food', 'طعام', 'Food') }),
        el('b', { text: String(Math.floor(stats.food)) }),
        el('span', { class: 'faint', text: `/${stats.foodPerDay}` }),
      ]),
    );

    this.hudEl.appendChild(
      el('div', {
        class: stats.population >= stats.capacity ? 'hud-stat warn' : 'hud-stat',
        'data-tip': t('hud.pop.tip', 'السكان الأحياء من أصل سعة القاعدة.', 'Living population against base capacity.'),
      }, [
        el('span', { class: 'lbl', text: t('hud.pop', 'سكان', 'Pop') }),
        el('b', { text: `${stats.population}/${stats.capacity}` }),
      ]),
    );

    this.hudEl.appendChild(
      el('div', { class: 'hud-stat' }, [
        el('span', { class: 'lbl', text: t('hud.base', 'القاعدة', 'Base') }),
        el('b', { text: String(stats.baseLevel) }),
      ]),
    );

    this.hudEl.appendChild(el('div', { class: 'hud-spacer' }));

    this.hudEl.appendChild(
      el('div', { class: 'hud-stat' }, [
        el('span', { class: 'lbl', text: t('hud.date', 'التاريخ', 'Date') }),
        el('b', { text: `${stats.date} ${stats.time}` }),
      ]),
    );

    // Time controls.
    const speeds: { v: 0 | 1 | 2 | 3; label: string; tip: string }[] = [
      { v: 0, label: '❚❚', tip: t('time.pause', 'إيقاف مؤقت.', 'Pause.') },
      { v: 1, label: '▶', tip: t('time.slow', 'سرعة بطيئة.', 'Slow speed.') },
      { v: 2, label: '▶▶', tip: t('time.normal', 'سرعة عادية.', 'Normal speed.') },
      { v: 3, label: '▶▶▶', tip: t('time.fast', 'سرعة سريعة.', 'Fast speed.') },
    ];
    const speedBox = el('div', { class: 'speed-controls' });
    for (const s of speeds) {
      const b = el('button', {
        class: `speed-btn ${this.engine.speed === s.v ? 'active' : ''}`.trim(),
        type: 'button',
        'data-tip': s.tip,
      });
      b.textContent = s.label;
      b.addEventListener('click', () => {
        this.engine.setSpeed(s.v);
        this.refreshHud();
      });
      speedBox.appendChild(b);
    }
    this.hudEl.appendChild(speedBox);

    const saveBtn = button(t('hud.save', 'حفظ', 'Save'), () => {
      const ok = this.engine.save(1);
      this.engine.store.notify(
        ok
          ? t('hud.save.ok', 'تم الحفظ بنجاح.', 'Saved successfully.')
          : t('hud.save.fail', 'فشل الحفظ.', 'Save failed.'),
        ok ? 'info' : 'danger',
      );
    }, 'btn-sm');
    this.hudEl.appendChild(saveBtn);
  }

  /* ---------------- launcher ---------------- */

  private renderLauncher(): void {
    clear(this.subbarEl);
    for (const panel of sortedPanels()) {
      const b = el('button', {
        class: `tab-btn ${this.openPanelId === panel.id ? 'active' : ''}`.trim(),
        type: 'button',
        'data-panel': panel.id,
      });
      b.appendChild(el('span', { text: `${panel.icon} ${this.lang === 'ar' ? panel.titleAr : panel.titleEn}` }));
      this.subbarEl.appendChild(b);
      b.addEventListener('click', () => this.toggle(panel.id));
    }
  }

  private toggle(id: string): void {
    if (this.openPanelId === id) this.closePanel();
    else this.openPanel(id);
  }

  openPanel(id: string, payload?: unknown): void {
    const panel = panelRegistry.get(id);
    if (!panel) {
      console.warn(`[ui] unknown panel "${id}"`);
      return;
    }
    this.currentPanel = panel;
    this.openPanelId = id;
    this.payload = payload ?? null;
    this.renderLauncher();
    this.rerenderPanel();
  }

  closePanel(): void {
    this.currentPanel = null;
    this.openPanelId = null;
    clear(this.panelHost);
    this.renderLauncher();
  }

  private rerenderPanel(): void {
    const panel = this.currentPanel;
    if (!panel) return;
    clear(this.panelHost);

    const container = el('div', {
      class: `panel ${panel.size === 'wide' ? 'wide' : panel.size === 'xwide' ? 'xwide' : ''}`.trim(),
    });

    const head = el('div', { class: 'panel-head' }, [
      el('h2', { text: this.lang === 'ar' ? panel.titleAr : panel.titleEn }),
    ]);
    const close = el('button', { class: 'close-x', type: 'button', title: t('ui.close', 'إغلاق', 'Close') });
    close.textContent = '✕';
    close.addEventListener('click', () => this.closePanel());
    head.appendChild(close);

    const body = el('div', { class: 'panel-body' });
    container.appendChild(head);
    container.appendChild(body);

    const ctx: PanelContext = {
      engine: this.engine,
      store: this.engine.store,
      state: this.engine.state,
      lang: this.lang,
      refresh: () => this.rerenderPanel(),
      close: () => this.closePanel(),
      notify: (text, kind) => this.engine.store.notify(text, kind ?? 'info'),
      open: (panelId, payload) => this.openPanel(panelId, payload),
      payload: this.payload,
    };

    try {
      panel.render(body, ctx);
    } catch (err) {
      console.error(`[ui] panel "${panel.id}" failed to render`, err);
      body.appendChild(
        el('div', { class: 'empty', text: t('ui.panelError', 'تعذّر عرض هذه اللوحة.', 'This panel failed to render.') }),
      );
    }

    this.panelHost.appendChild(container);
  }

  /* ---------------- toasts ---------------- */

  pushToast(text: string, kind: 'info' | 'warn' | 'danger' = 'info'): void {
    const node = el('div', { class: `toast ${kind}`.trim(), text });
    this.toastEl.appendChild(node);
    const lifetime = kind === 'danger' ? 9000 : 5200;
    window.setTimeout(() => {
      node.style.transition = 'opacity .3s';
      node.style.opacity = '0';
      window.setTimeout(() => node.remove(), 320);
    }, lifetime);
    while (this.toastEl.children.length > 6) this.toastEl.firstElementChild?.remove();
  }

  /** Current HUD values, used by the tutorial and tests. */
  getStats(): HudStats | null {
    return this.hudStats;
  }
}
