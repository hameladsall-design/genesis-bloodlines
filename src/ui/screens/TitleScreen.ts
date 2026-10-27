/**
 * The title screen: new game setup and save-slot loading.
 */

import type { NewGameConfig } from '../../game/simulation/types';
import { DEFAULT_CONFIG } from '../../game/simulation/systems/newGame';
import { t } from '../../i18n';
import { button, clear, el } from '../dom';

export const EMBLEMS = ['♛', '⚔', '🐺', '🩸', '🌙', '👑', '🗡', '🦇', '🐉', '🕯', '⚜', '🜲'];

export interface TitleScreenOptions {
  onNewGame(config: NewGameConfig): void;
  onLoadGame(slot: number | 'auto'): void;
  listSaves(): { slot: number; name: string; savedAt: number; day: number; year: number; founder: string; dynasty: string; population: number }[];
}

export class TitleScreen {
  private root: HTMLElement;
  private options: TitleScreenOptions;
  private config: NewGameConfig = { ...DEFAULT_CONFIG };

  constructor(root: HTMLElement, options: TitleScreenOptions) {
    this.root = root;
    this.options = options;
    this.render();
  }

  destroy(): void {
    clear(this.root);
  }

  private render(): void {
    clear(this.root);

    const screen = el('div', { class: 'title-screen' });
    const inner = el('div', { class: 'title-inner' });

    inner.appendChild(
      el('div', { class: 'title-mark' }, [
        el('h1', { text: 'GENESIS: BLOODLINES' }),
        el('div', { class: 'sub', text: 'سلالات الدم' }),
        el('div', {
          class: 'tagline',
          text: t(
            'title.tagline',
            'العالم تصادم فالعوالم تصطدم. ابنِ سلالةً تنجو من الجوع والقتال والسحر، وحفظ دمها حتى يومٍ لا؟',
            'Worlds have collided. Build a bloodline that survives hunger, war and magic.',
          ),
        }),
      ]),
    );

    const grid = el('div', { class: 'setup-grid' });

    // --- Identity ---
    const identity = el('div', { class: 'setup-col' }, [el('h3', { text: t('setup.identity', 'هوية المؤسس', 'Founder Identity') })]);
    identity.appendChild(this.textField(t('setup.founder', 'اسم المؤسس', 'Founder name'), 'founderName'));
    identity.appendChild(this.textField(t('setup.family', 'اسم العائلة', 'Family name'), 'familyName'));
    identity.appendChild(this.textField(t('setup.dynasty', 'اسم السلالة', 'Dynasty name'), 'dynastyName'));
    identity.appendChild(this.textField(t('setup.seed', 'بذرة العالم', 'World seed'), 'seed'));

    identity.appendChild(el('label', { class: 'field' }, [
      el('span', { text: t('setup.emblem', 'شعار السلالة', 'Dynasty emblem') }),
      this.emblemPicker(),
    ]));

    identity.appendChild(
      el('div', { class: 'color-row' }, [
        el('span', { class: 'muted', text: t('setup.colors', 'ألوان السلالة', 'Dynasty colours') }),
        this.colorInput('primaryColor'),
        this.colorInput('secondaryColor'),
      ]),
    );

    // --- World ---
    const world = el('div', { class: 'setup-col' }, [el('h3', { text: t('setup.world', 'العالم', 'The World') })]);
    world.appendChild(this.selectField(t('setup.size', 'حجم العالم', 'World size'), 'worldSize', [
      { value: 'small', label: t('setup.size.small', 'صغير', 'Small') },
      { value: 'medium', label: t('setup.size.medium', 'متوسط', 'Medium') },
      { value: 'large', label: t('setup.size.large', 'كبير', 'Large') },
    ]));
    world.appendChild(this.selectField(t('setup.difficulty', 'الصعوبة', 'Difficulty'), 'difficulty', [
      { value: 'easy', label: t('setup.diff.easy', 'سهلة', 'Easy') },
      { value: 'normal', label: t('setup.diff.normal', 'عادية', 'Normal') },
      { value: 'hard', label: t('setup.diff.hard', 'صعبة', 'Hard') },
      { value: 'nightmare', label: t('setup.diff.nightmare', 'كابوس', 'Nightmare') },
    ]));
    world.appendChild(this.selectField(t('setup.enemyDensity', 'كثافة الأعداء', 'Enemy density'), 'enemyDensity', [
      { value: 'low', label: t('setup.density.low', 'منخفضة', 'Low') },
      { value: 'normal', label: t('setup.density.normal', 'عادية', 'Normal') },
      { value: 'high', label: t('setup.density.high', 'عالية', 'High') },
      { value: 'extreme', label: t('setup.density.extreme', 'متوحشة', 'Extreme') },
    ]));
    world.appendChild(this.selectField(t('setup.abundance', 'وفرة الموارد', 'Resource abundance'), 'resourceAbundance', [
      { value: 'scarce', label: t('setup.abh.scarce', 'شحيحة', 'Scarce') },
      { value: 'normal', label: t('setup.abh.normal', 'عادية', 'Normal') },
      { value: 'abundant', label: t('setup.abh.abundant', 'وفيرة', 'Abundant') },
    ]));

    // --- Survival ---
    const survival = el('div', { class: 'setup-col' }, [el('h3', { text: t('setup.survival', 'الحياة والمصير', 'Life and Fate') })]);
    survival.appendChild(this.selectField(t('setup.disease', 'تكرار الأمراض', 'Disease frequency'), 'diseaseFrequency', [
      { value: 'rare', label: t('setup.dis.rare', 'نادرة', 'Rare') },
      { value: 'normal', label: t('setup.dis.normal', 'عادية', 'Normal') },
      { value: 'frequent', label: t('setup.dis.frequent', 'متكررة', 'Frequent') },
    ]));
    survival.appendChild(this.selectField(t('setup.disaster', 'تكرار الكوارث', 'Disaster frequency'), 'disasterFrequency', [
      { value: 'rare', label: t('setup.dis2.rare', 'نادرة', 'Rare') },
      { value: 'normal', label: t('setup.dis2.normal', 'عادية', 'Normal') },
      { value: 'frequent', label: t('setup.dis2.frequent', 'متكررة', 'Frequent') },
    ]));
    survival.appendChild(this.selectField(t('setup.speed', 'سرعة مرور الوقت', 'Time progression'), 'timeSpeed', [
      { value: '0', label: t('setup.sp.0', 'متوقّف', 'Paused') },
      { value: '1', label: t('setup.sp.1', 'بطيئة', 'Slow') },
      { value: '2', label: t('setup.sp.2', 'عادية', 'Normal') },
      { value: '3', label: t('setup.sp.3', 'سريعة', 'Fast') },
    ]));

    grid.appendChild(identity);
    grid.appendChild(world);
    grid.appendChild(survival);
    inner.appendChild(grid);

    // --- Saves ---
    const saves = this.options.listSaves();
    if (saves.length > 0) {
      const saveCol = el('div', { class: 'setup-col', style: 'margin-top:16px' }, [
        el('h3', { text: t('setup.saves', 'الألعاب المحفوظة', 'Saved Games') }),
      ]);
      const list = el('div', { class: 'save-list' });
      for (const s of saves) {
        const item = el('div', { class: 'save-item' }, [
          el('div', { class: 'col', style: 'gap:2px;flex:1' }, [
            el('div', {}, [
              el('b', { text: `${s.founder} · ${s.dynasty}` }),
              el('span', { class: 'muted', text: ` — ${t('setup.slot', 'فتحة', 'Slot')} ${s.slot}` }),
            ]),
            el('div', { class: 'muted', style: 'font-size:11.5px', text: `${s.day}/${s.year} · ${s.population} ${t('setup.residents', 'مقيم', 'residents')}` }),
          ]),
          button(t('setup.load', 'تحميل', 'Load'), () => this.options.onLoadGame(s.slot === 0 ? 'auto' : s.slot), 'btn-sm'),
        ]);
        list.appendChild(item);
      }
      saveCol.appendChild(list);
      inner.appendChild(saveCol);
    }

    const actions = el('div', { class: 'setup-actions' }, [
      button(t('setup.start', 'ابدأ السلالة', 'Begin the Bloodline'), () => {
        this.options.onNewGame({ ...this.config });
      }, 'btn-primary'),
      button(t('setup.randomSeed', 'بذرة عشوائية', 'Random seed'), () => {
        this.config.seed = `sang-${Math.floor(Math.random() * 9000 + 1000)}`;
        this.render();
      }, 'btn'),
    ]);
    inner.appendChild(actions);

    inner.appendChild(
      el('div', { class: 'hint', style: 'text-align:center;margin-top:18px' , text: t(
        'setup.hint',
        'تبدأ القاعدة كملجأ بسيط يتّسع لعشرة من النفوس. اجمع الخشب والحجر، وأطعم من لا يطعم نفسه، وابنِ سلالة لا تموت.',
        'Your base starts as a simple shelter for ten. Gather, feed, and build a bloodline that refuses to die.',
      )}),
    );

    screen.appendChild(inner);
    this.root.appendChild(screen);
  }

  private textField(label: string, key: keyof NewGameConfig): HTMLElement {
    const input = el('input', { class: 'input', type: 'text', value: String(this.config[key]) }) as HTMLInputElement;
    input.addEventListener('input', () => {
      (this.config as unknown as Record<string, unknown>)[key] = input.value;
    });
    return el('label', { class: 'field' }, [el('span', { text: label }), input]);
  }

  private selectField(
    label: string,
    key: keyof NewGameConfig,
    options: { value: string; label: string }[],
  ): HTMLElement {
    const select = el('select', { class: 'input' }) as HTMLSelectElement;
    for (const opt of options) {
      const o = el('option', { value: opt.value, text: opt.label }) as HTMLOptionElement;
      select.appendChild(o);
    }
    select.value = String(this.config[key]);
    select.addEventListener('change', () => {
      (this.config as unknown as Record<string, unknown>)[key] = select.value;
    });
    return el('label', { class: 'field' }, [el('span', { text: label }), select]);
  }

  private emblemPicker(): HTMLElement {
    const row = el('div', { class: 'emblem-row' });
    for (const emblem of EMBLEMS) {
      const b = el('button', {
        class: `emblem-opt ${this.config.emblem === emblem ? 'active' : ''}`.trim(),
        type: 'button',
      });
      b.textContent = emblem;
      b.addEventListener('click', () => {
        this.config.emblem = emblem;
        this.render();
      });
      row.appendChild(b);
    }
    return row;
  }

  private colorInput(key: 'primaryColor' | 'secondaryColor'): HTMLElement {
    const input = el('input', { type: 'color', value: this.config[key] }) as HTMLInputElement;
    input.addEventListener('input', () => {
      this.config[key] = input.value;
    });
    return input;
  }
}
