/**
 * Settlement panels: construction, resources, inventory, research and religion.
 */

import type { ResourceKey } from '../../game/simulation/types';
import {
  getBaseLevel,
  nextBaseLevel,
} from '../../game/content/baseLevels';
import { BUILDING_LIST } from '../../game/content/buildings';
import {
  canUpgradeBase,
  isBuildingUnlocked,
  isPlacementValid,
  placeBuilding,
  upgradeBase,
} from '../../game/simulation/systems/base';
import {
  gatherFromNode,
  harvestFarm,
  huntInWilderness,
  plantFarm,
  resourceLabel,
  starvationStatus,
} from '../../game/simulation/systems/economy';
import { t } from '../../i18n';
import { button, el, kv, section, tag } from '../dom';
import { registerPanel, type PanelContext } from './types';

/* ------------------------------------------------------------------ */
/* Construction                                                       */
/* ------------------------------------------------------------------ */

function costRow(bag: Record<string, number | undefined>, ctx: PanelContext): HTMLElement {
  const entries = Object.entries(bag).filter(([, v]) => (v ?? 0) > 0);
  if (entries.length === 0) return el('span', { class: 'muted', text: '—' });
  return el(
    'div',
    { class: 'chip-row' },
    entries.map(([key, amount]) => {
      const have = ctx.store.getResource(key as ResourceKey);
      const need = amount ?? 0;
      const cls = have >= need ? 'tag' : 'tag tag-blood';
      return el('span', { class: cls, text: `${resourceLabel(key as ResourceKey, ctx.lang)} ${have}/${need}` });
    }),
  );
}

registerPanel({
  id: 'construction',
  titleAr: 'البناء',
  titleEn: 'Construction',
  icon: '🏰',
  order: 50,
  size: 'wide',
  render(root, ctx) {
    const state = ctx.state;
    const current = getBaseLevel(state.base.level);
    const next = nextBaseLevel(state.base.level);

    // Base level and upgrade.
    root.appendChild(
      section(
        t('build.base', 'رتبة القاعدة', 'Base rank'),
        el('div', { class: 'row' }, [
          el('span', { class: 'panel-title', style: 'margin:0', text: ctx.lang === 'ar' ? current.nameAr : current.nameEn }),
          tag(`${t('build.level', 'المستوى', 'Level')} ${current.level}`),
          tag(`${t('build.capacity', 'السعة', 'Capacity')} ${current.capacity}`),
          tag(`${t('build.area', 'المساحة', 'Area')} ${current.area.w}×${current.area.h}`),
          tag(`${t('build.defense', 'الدفاع', 'Defense')} ${current.defense}`),
        ]),
        el('div', { class: 'hint', style: 'margin-top:6px', text: ctx.lang === 'ar' ? current.descAr : current.descEn }),
      ),
    );

    if (next) {
      const missing = ctx.store.missingResources(next.cost);
      const affordable = Object.keys(missing).length === 0;

      root.appendChild(
        section(
          t('build.upgrade', 'الترقية إلى المستوى التالي', 'Upgrade to the next rank'),
          el('div', { class: 'row' }, [
            el('span', { class: 'panel-title', style: 'margin:0', text: ctx.lang === 'ar' ? next.nameAr : next.nameEn }),
            tag(`${t('build.level', 'المستوى', 'Level')} ${next.level}`),
            tag(`${t('build.capacity', 'السعة', 'Capacity')} ${next.capacity}`),
            tag(`${t('build.area', 'المساحة', 'Area')} ${next.area.w}×${next.area.h}`),
          ]),
          el('div', { style: 'margin-top:8px' }, [
            el('div', { class: 'muted', style: 'font-size:12px', text: t('build.cost', 'التكلفة', 'Cost') }),
            costRow(next.cost, ctx),
          ]),
          el('div', { style: 'margin-top:8px' }, [
            button(
              affordable ? t('build.upgradeNow', 'قم بالترقية', 'Upgrade now') : t('build.missing', 'المواد ناقصة', 'Materials missing'),
              () => {
                const result = canUpgradeBase(ctx.store);
                if (!result.ok) {
                  ctx.notify(result.reason ?? t('build.fail', 'تعذّرت الترقية.', 'The upgrade failed.'), 'danger');
                  return;
                }
                upgradeBase(ctx.store);
                ctx.notify(t('build.ok', 'ترقّت القاعدة.', 'The base was upgraded.'), 'info');
                ctx.refresh();
              },
              affordable ? 'btn-primary' : '',
              !affordable,
            ),
          ]),
          affordable
            ? null
            : el('div', {
                class: 'locked-note',
                text: t('build.missingList', 'المواد الناقصة تُحتسب أعلاه بالأحمر. اجمعها أو استبدل مواد أخرى.',
                  'Missing materials are marked in red above. Gather them or trade others away.'),
              }),
        ),
      );
    } else {
      root.appendChild(el('div', { class: 'empty', text: t('build.max', 'بلغت القمة: عاصمة مملكة.', 'You have reached the summit: a kingdom capital.') }));
    }

    // Building catalog.
    const unlocked = BUILDING_LIST.filter((b) => isBuildingUnlocked(b.id, state.base.level));
    const locked = BUILDING_LIST.filter((b) => !isBuildingUnlocked(b.id, state.base.level));

    root.appendChild(
      section(
        `${t('build.catalog', 'دليل المباني', 'Building catalog')} (${unlocked.length})`,
        el(
          'div',
          { class: 'grid-2' },
          unlocked.map((def) => {
            const card = el('div', { class: 'card' }, [
              el('div', { class: 'row' }, [
                el('span', { class: 'card-name', text: ctx.lang === 'ar' ? def.nameAr : def.nameEn }),
                tag(def.category, 'tag-blue'),
              ]),
              el('div', { class: 'card-sub', text: ctx.lang === 'ar' ? def.descAr : def.descEn }),
              el('div', { style: 'margin-top:6px' }, [costRow(def.cost, ctx)]),
              el('div', { class: 'stat-row', style: 'margin-top:4px' }, [
                def.housing ? el('span', { html: `${t('build.housing', 'سكن', 'Housing')} <b>${def.housing}</b>` }) : null,
                def.workers ? el('span', { html: `${t('build.workers', 'عمّال', 'Workers')} <b>${def.workers}</b>` }) : null,
                def.defense ? el('span', { html: `${t('build.defense', 'دفاع', 'Defense')} <b>${def.defense}</b>` }) : null,
                def.storage ? el('span', { html: `${t('build.storage', 'تخزين', 'Storage')} <b>${def.storage}</b>` }) : null,
                el('span', { html: `${t('build.days', 'أيام البناء', 'Build days')} <b>${def.buildDays}</b>` }),
              ]),
            ]);
            card.appendChild(
              button(t('build.place', 'ابدأ البناء', 'Start construction'), () => {
                const placed = placeBuildingAtFreeSpot(ctx);
                if (!placed.ok) {
                  ctx.notify(placed.reason ?? t('build.fail', 'تعذّر البناء.', 'Could not build.'), 'danger');
                  return;
                }
                ctx.notify(t('build.started', 'بدأ البناء.', 'Construction started.'), 'info');
                ctx.refresh();
              }, 'btn-sm'),
            );
            return card;
          }),
        ),
      ),
    );

    if (locked.length > 0) {
      root.appendChild(
        section(
          `${t('build.locked', 'مباني مقفلة', 'Locked buildings')} (${locked.length})`,
          el(
            'div',
            { class: 'grid-2' },
            locked.map((def) =>
              el('div', { class: 'card', style: 'opacity:.62' }, [
                el('div', { class: 'row' }, [
                  el('span', { class: 'card-name', text: ctx.lang === 'ar' ? def.nameAr : def.nameEn }),
                  tag(t('build.locked', 'مقفل', 'Locked'), 'tag-blood'),
                ]),
                el('div', { class: 'locked-note', text: t('build.requires', `يتطلب رتبة القاعدة ${def.unlockBaseLevel}`, `Requires base level ${def.unlockBaseLevel}`) }),
              ]),
            ),
          ),
        ),
      );
    }
  },
});

/** Places a building on the first free slot of the settlement grid. */
function placeBuildingAtFreeSpot(ctx: PanelContext, defId?: string): { ok: boolean; reason?: string } {
  const state = ctx.state;
  const area = getBaseLevel(state.base.level).area;

  const ids = defId ? [defId] : BUILDING_LIST.filter((b) => isBuildingUnlocked(b.id, state.base.level)).map((b) => b.id);
  for (const id of ids) {
    for (let y = 0; y < area.h; y++) {
      for (let x = 0; x < area.w; x++) {
        if (!isPlacementValid(state, id, x, y)) continue;
        const result = placeBuilding(ctx.store, id, x, y);
        if (result.ok) return result;
      }
    }
  }
  return { ok: false, reason: t('build.noSpace', 'لا توجد مساحة خالية في الشبكة.', 'No free space on the grid.') };
}

/* ------------------------------------------------------------------ */
/* Resources                                                          */
/* ------------------------------------------------------------------ */

registerPanel({
  id: 'resources',
  titleAr: 'الموارد',
  titleEn: 'Resources',
  icon: '⛏',
  order: 51,
  render(root, ctx) {
    const state = ctx.state;
    const daily = ctx.store.dailyFoodConsumption();
    const food = ctx.store.getResource('food');
    const status = starvationStatus(state);

    root.appendChild(
      section(
        t('res.stock', 'المخزون', 'Stock'),
        el(
          'div',
          { class: 'grid-3' },
          (Object.keys(state.resources) as ResourceKey[]).map((key) =>
            el('div', { class: 'card', style: 'margin:0' }, [
              el('div', { class: 'card-name', text: resourceLabel(key, ctx.lang) }),
              el('div', { class: 'badge-count', text: String(Math.floor(ctx.store.getResource(key))) }),
            ]),
          ),
        ),
      ),
    );

    // Food status.
    root.appendChild(
      section(
        t('res.food', 'الطعام', 'Food'),
        kv(t('res.foodNow', 'المتاح', 'In store'), String(food)),
        kv(t('res.foodDaily', 'الاستهلاك اليومي', 'Consumed per day'), String(daily)),
        kv(t('res.foodDays', 'يكفي (يوم)', 'Days of supply'), daily > 0 ? String(Math.floor(food / daily)) : '∞'),
        status.level === 'none'
          ? el('div', { class: 'hint ok', text: t('res.foodOk', 'المخزون كافٍ.', 'The supply is sufficient.') })
          : el('div', { class: 'ranked-warning', style: 'margin-top:8px' }, [
              el('h4', { text: t('res.foodWarn', 'تحذير: مخزون الطعام ينفد', 'Warning: the food supply is depleting') }),
              el('div', { text: t(
                'res.foodWarnBody',
                `لديك ${food} وحدة طعام، والاستهلاك اليومي ${daily} وحدة. ابدأ Hunting أو اصنع مزارع أو اقاتل من أجساد الغزاة — فالقتال مصدر رئيسي للطعام.`,
                `You hold ${food} food and consume ${daily} per day. Hunt, build farms, or fight raiders — combat is a primary source of food.`,
              )}),
            ]),
      ),
    );

    // Gathering.
    const nodes = state.world.resourceNodes.filter((n) => n.amount > 0).slice(0, 80);
    root.appendChild(
      section(
        t('res.gather', 'جمع الموارد', 'Gathering'),
        el('div', { class: 'hint', text: t('res.gatherHint', 'اختر شخصية عاملة ثم اضغط على العُقدة. لكل عقدة كمية محدودة تنفد مع الوقت.', 'Pick a worker, then click a node. Every node holds a finite amount that runs out.') }),
        el(
          'div',
          { class: 'col', style: 'gap:6px;max-height:320px;overflow:auto' },
          nodes.map((node) =>
            el('div', { class: 'card', style: 'margin:0;display:flex;gap:8px;align-items:center' }, [
              el('div', { class: 'col', style: 'gap:1px;flex:1;min-width:0' }, [
                el('div', { class: 'card-name', text: resourceLabel(node.kind, ctx.lang) }),
                el('div', { class: 'card-sub', text: `${t('res.amount', 'الكمية', 'Amount')}: ${node.amount}/${node.maxAmount}` }),
              ]),
              button(t('res.gather', 'اجمع', 'Gather'), () => {
                const worker = ctx.store.livingCharacters()[0];
                if (!worker) {
                  ctx.notify(t('res.noWorker', 'لا أحد متاح للجمع.', 'Nobody is available to gather.'), 'warn');
                  return;
                }
                const result = gatherFromNode(ctx.store, node.id, worker.id);
                if (!result.ok) {
                  ctx.notify(result.reason ?? t('res.gatherFail', 'تعذّر الجمع.', 'Gathering failed.'), 'danger');
                  return;
                }
                ctx.notify(t('res.gatherOk', 'تمّ الجمع.', 'Resources gathered.'), 'info');
                ctx.refresh();
              }, 'btn-sm'),
            ]),
          ),
        ),
      ),
    );

    // Farming and hunting.
    root.appendChild(
      section(
        t('res.farm', 'الزراعة والصيد', 'Farming and hunting'),
        el('div', { class: 'row' }, [
          button(t('res.plant', 'ازرع محصولًا', 'Plant a crop'), () => {
            const ok = plantFarm(ctx.store);
            ctx.notify(
              ok ? t('res.planted', 'زرعت الحقل.', 'The field was planted.') : t('res.plantFail', 'لا يمكن الزراعة بعد.', 'You cannot plant right now.'),
              ok ? 'info' : 'warn',
            );
            ctx.refresh();
          }),
          button(t('res.harvest', 'احصد', 'Harvest'), () => {
            const result = harvestFarm(ctx.store);
            ctx.notify(
              result.ok ? t('res.harvested', `حصدت ${result.food} وحدة طعام.`, `Harvested ${result.food} food.`) : (result.reason ?? '—'),
              result.ok ? 'info' : 'warn',
            );
            ctx.refresh();
          }),
          button(t('res.hunt', 'اصطد', 'Hunt'), () => {
            const hunter = ctx.store.livingCharacters()[0];
            if (!hunter) {
              ctx.notify(t('res.noWorker', 'لا أحد متاح للصيد.', 'Nobody is available to hunt.'), 'warn');
              return;
            }
            const result = huntInWilderness(ctx.store, hunter.id);
            ctx.notify(
              result.ok ? t('res.hunted', `عُدتَ بـ ${result.food} وحدة طعام.`, `The hunt yielded ${result.food} food.`) : (result.reason ?? '—'),
              result.ok ? 'info' : 'warn',
            );
            ctx.refresh();
          }),
        ]),
      ),
    );
  },
});

/* ------------------------------------------------------------------ */
/* Inventory                                                          */
/* ------------------------------------------------------------------ */

registerPanel({
  id: 'inventory',
  titleAr: 'الحقيبة',
  titleEn: 'Inventory',
  icon: '🎒',
  order: 52,
  render(root, ctx) {
    const entries = Object.entries(ctx.state.resources).filter(([, v]) => (v ?? 0) > 0);
    if (entries.length === 0) {
      root.appendChild(el('div', { class: 'empty', text: t('inv.empty', 'الحقيبة فارغة.', 'The pack is empty.') }));
      return;
    }
    root.appendChild(
      el(
        'table',
        { class: 'data' },
        [
          el('thead', {}, [el('tr', {}, [el('th', { text: t('inv.item', 'العنصر', 'Item') }), el('th', { text: t('inv.count', 'العدد', 'Count') })])]),
          el(
            'tbody',
            {},
            entries.map(([key, value]) =>
              el('tr', {}, [
                el('td', { text: resourceLabel(key as ResourceKey, ctx.lang) }),
                el('td', { class: 'num', text: String(value) }),
              ]),
            ),
          ),
        ],
      ),
    );
  },
});

/* ------------------------------------------------------------------ */
/* Research and religion                                              */
/* ------------------------------------------------------------------ */

registerPanel({
  id: 'research',
  titleAr: 'البحث',
  titleEn: 'Research',
  icon: '📖',
  order: 60,
  render(root, ctx) {
    const unlocked = ctx.state.base.buildings.filter((b) => b.defId === 'library' || b.defId === 'school');
    root.appendChild(
      el('div', { class: 'hint', text: t(
        'research.hint',
        'تبني مكتبةً أو مدرسةً لفتح أبحاثٍ جديدة توسّع ما يمكن بناؤه وما يمكن صيده.',
        'Build a library or a school to unlock research that widens what you can build and hunt.',
      )}),
    );
    if (unlocked.length === 0) {
      root.appendChild(el('div', { class: 'empty', text: t('research.locked', 'تحتاج مكتبةً أو مدرسة. البناء متاح في دليل المباني.', 'You need a library or a school. See the building catalog.') }));
      return;
    }
    root.appendChild(
      section(
        t('research.active', 'الأبحاث الجارية', 'Active research'),
        el('div', { class: 'empty', text: t('research.none', 'لا بحث نشط. ستتوسّع الأبحاث في المرحلة القادمة.', 'No active research. More research opens in a later phase.') }),
      ),
    );
  },
});

registerPanel({
  id: 'religion',
  titleAr: 'الدين',
  titleEn: 'Religion',
  icon: '⛪',
  order: 61,
  render(root, ctx) {
    root.appendChild(
      el('div', { class: 'hint', text: t(
        'religion.hint',
        'تقاليد السلالة وقوانينها تُحفظ هنا. المعبد يثبّت أهل المستوطنة ويكون مضجعًا مقدّسًا للساقطين.',
        'The traditions and laws of the bloodline live here. A temple steadies the settlers.',
      )}),
    );
    const traditions = ctx.state.base.traditions ?? [];
    const temples = ctx.state.base.buildings.filter((b) => b.defId === 'temple');
    root.appendChild(
      section(
        t('religion.traditions', 'التقاليد', 'Traditions'),
        traditions.length === 0
          ? el('div', { class: 'empty', text: t('religion.none', 'لم تُرسَم تقاليد بعد.', 'No tradition has been set yet.') })
          : el('div', { class: 'chip-row' }, traditions.map((x) => tag(x, 'tag-gold'))),
      ),
    );
    root.appendChild(
      section(
        t('religion.temples', 'المعابد', 'Temples'),
        temples.length === 0
          ? el('div', { class: 'hint', text: t('religion.noTemple', 'لا معبد في المستوطنة.', 'No temple in the settlement.') })
          : el('div', { class: 'hint', text: `${temples.length}` }),
      ),
    );
  },
});
