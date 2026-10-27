/**
 * The roster panel and the single-character profile panel.
 *
 * Character cards always show the level, the race and the biological sex so
 * the player can read combat strength at a glance.
 */

import type { Character } from '../../game/simulation/types';
import { getSpecies, sexLabel } from '../../game/content/species';
import { traitInfo } from '../../game/simulation/systems/genetics';
import { lifespanOf } from '../../game/simulation/systems/progression';
import { t } from '../../i18n';
import { bar, el, kv, section, tag } from '../dom';
import { portraitElement } from '../portrait';
import { registerPanel, type PanelContext } from './types';

/** Small status pill showing the character's current condition. */
export function conditionTag(c: Character): HTMLElement {
  const map: Record<string, [string, string]> = {
    healthy: ['سليم', 'tag-forest'],
    injured: ['مصاب', 'tag-warn'],
    incapacitated: ['عاجز', 'tag-blood'],
    ill: ['مريض', 'tag-warn'],
    starving: ['مجوع', 'tag-blood'],
    dead: ['ميت', 'tag-blood'],
  };
  const [label, cls] = map[c.status.condition] ?? ['—', ''];
  return tag(label, cls);
}

/** Race + sex + level line shared by every character card. */
export function identityLine(c: Character, lang: 'ar' | 'en'): HTMLElement {
  const species = getSpecies(c.race);
  const raceName = lang === 'ar' ? species.nameAr : species.nameEn;
  const sex = sexLabel(c.sex, c.race, lang);
  return el('div', { class: 'card-sub' }, [
    el('span', { text: `${raceName} · ${sex} · ${t('char.level', 'مستوى', 'Level')} ${c.level}` }),
  ]);
}

function hpRatio(c: Character): number {
  const max = c.stats.hp || 1;
  return Math.max(0, Math.min(1, c.health / max));
}

function characterCard(c: Character, ctx: PanelContext): HTMLElement {
  const card = el('div', { class: 'card clickable' });
  card.appendChild(portraitElement(c.race, !c.alive));
  card.appendChild(
    el('div', { class: 'col', style: 'gap:2px;flex:1;min-width:0' }, [
      el('div', { class: 'card-head' }, [
        el('span', { class: 'card-name', text: `${c.firstName} ${c.familyName}` }),
        conditionTag(c),
      ]),
      identityLine(c, ctx.lang),
      bar(hpRatio(c), 'hp'),
      el('div', { class: 'stat-row' }, [
        el('span', { html: `${t('char.hp', 'صحة', 'HP')} <b>${Math.round(c.health)}</b>/${Math.round(c.stats.hp)}` }),
        el('span', { html: `${t('char.dmg', 'ضرر', 'DMG')} <b>${Math.round(c.stats.damage)}</b>` }),
        el('span', { html: `${t('char.def', 'دفاع', 'DEF')} <b>${Math.round(c.stats.defense)}</b>` }),
        el('span', { html: `${t('char.sta', 'لياقة', 'STA')} <b>${Math.round(c.stats.stamina)}</b>` }),
        el('span', { html: `${t('char.spd', 'سرعة', 'SPD')} <b>${Math.round(c.stats.speed)}</b>` }),
      ]),
    ]),
  );
  card.addEventListener('click', () => ctx.open('character', c.id));
  return card;
}

registerPanel({
  id: 'characters',
  titleAr: 'السكان',
  titleEn: 'Roster',
  icon: '👥',
  order: 10,
  render(root, ctx) {
    const state = ctx.state;
    const living = ctx.store.livingCharacters();
    const dead = ctx.store.allCharacters().filter((c) => !c.alive);

    root.appendChild(
      section(
        t('roster.living', 'الأحياء', 'The living'),
        el('div', { class: 'hint', text: `${living.length} / ${state.base.capacity} ${t('roster.cap', 'من سعة القاعدة', 'of base capacity')}` }),
        ...living.map((c) => characterCard(c, ctx)),
        living.length === 0 ? el('div', { class: 'empty', text: t('roster.empty', 'لا أحد حيّ بعد.', 'Nobody lives yet.') }) : null,
      ),
    );

    if (dead.length > 0) {
      root.appendChild(
        section(
          t('roster.dead', 'الرقدان — يُحتفظ بسجلّهم', 'The fallen — their record is kept'),
          ...dead.map((c) => characterCard(c, ctx)),
        ),
      );
    }
  },
});

registerPanel({
  id: 'character',
  titleAr: 'ملف الشخص',
  titleEn: 'Character',
  icon: '📜',
  order: 99,
  render(root, ctx) {
    const id = ctx.payload as string | undefined;
    const c = id ? ctx.store.getCharacter(id) : undefined;
    if (!c) {
      root.appendChild(el('div', { class: 'empty', text: t('char.none', 'اختر شخصية من قائمة السكان.', 'Pick a character from the roster.') }));
      return;
    }

    const species = getSpecies(c.race);
    const lang = ctx.lang;

    const head = el('div', { class: 'row', style: 'align-items:flex-start;gap:14px' }, [
      portraitElement(c.race, !c.alive, true),
      el('div', { class: 'col', style: 'gap:4px;flex:1' }, [
        el('div', { class: 'card-head' }, [
          el('span', { class: 'card-name', style: 'font-size:16px', text: `${c.firstName} ${c.familyName}` }),
          conditionTag(c),
          c.isFounder ? tag(t('char.founder', 'المؤسس', 'Founder'), 'tag-gold') : null,
          c.household === 'resident' ? tag(t('char.resident', 'مقيم', 'Resident')) : null,
          c.permadead ? tag(t('char.permadead', 'موت دائم', 'Permadead'), 'tag-blood') : null,
        ]),
        identityLine(c, lang),
        el('div', { class: 'chip-row' }, [
          tag(`${t('char.age', 'العمر', 'Age')} ${c.age.toFixed(1)}`),
          tag(`${t('char.lifespan', 'الأمد', 'Lifespan')} ${lifespanOf(c)}`),
          tag(lang === 'ar' ? species.descAr : species.descEn, ''),
        ]),
      ]),
    ]);
    root.appendChild(head);

    // Level and experience.
    const xpRatio = c.xpToNext > 0 ? Math.min(1, c.xp / c.xpToNext) : 0;
    root.appendChild(
      section(
        t('char.progress', 'التقدّم', 'Progression'),
        kv(t('char.level', 'المستوى', 'Level'), String(c.level)),
        kv(t('char.xp', 'الخبرة', 'Experience'), `${Math.round(c.xp)} / ${Math.round(c.xpToNext)}`),
        bar(xpRatio, 'xp'),
      ),
    );

    // Combat stats.
    root.appendChild(
      section(
        t('char.combat', 'قدرات القتال', 'Combat statistics'),
        el('table', { class: 'data' }, [
          el('tbody', {}, [
            row(t('char.hp', 'الصحة', 'Health'), `${Math.round(c.health)} / ${Math.round(c.stats.hp)}`),
            row(t('char.dmg', 'الضرر', 'Damage'), String(Math.round(c.stats.damage))),
            row(t('char.def', 'الدفاع', 'Defense'), String(Math.round(c.stats.defense))),
            row(t('char.sta', 'اللياقة', 'Stamina'), String(Math.round(c.stats.stamina))),
            row(t('char.spd', 'السرعة', 'Speed'), String(Math.round(c.stats.speed))),
            row(t('char.acc', 'الدقة', 'Accuracy'), `${Math.round(c.stats.accuracy * 100)}%`),
            row(t('char.eva', 'المراوغة', 'Evasion'), `${Math.round(c.stats.evasion * 100)}%`),
            row(t('char.crit', 'الضربة القاضية', 'Critical'), `${Math.round(c.stats.critChance * 100)}%`),
            row(t('char.mr', 'مقاومة السحر', 'Magic resist'), `${Math.round(c.stats.magicResist * 100)}%`),
            row(t('char.range', 'مدى الهجوم', 'Attack range'), String(c.stats.attackRange)),
            row(t('char.aspd', 'سرعة الهجوم', 'Attack speed'), String(c.stats.attackSpeed)),
          ]),
        ]),
      ),
    );

    // Condition.
    root.appendChild(
      section(
        t('char.condition', 'الحالة', 'Condition'),
        kv(t('char.hunger', 'الجوع', 'Hunger'), `${Math.round(c.status.hunger)}%`),
        bar(c.status.hunger / 100, 'morale'),
        kv(t('char.morale', 'المعنويات', 'Morale'), `${Math.round(c.status.morale)}%`),
        c.status.disease
          ? kv(t('char.disease', 'المرض', 'Disease'), `${c.status.disease.nameAr} (${c.status.disease.daysLeft} ${t('char.days', 'يوم', 'days')})`)
          : null,
        c.status.injury
          ? kv(t('char.injury', 'الإصابة', 'Injury'), `${c.status.injury.nameAr} (${c.status.injury.daysLeft} ${t('char.days', 'يوم', 'days')})`)
          : null,
      ),
    );

    // Genetics.
    const phenotype = c.phenotype ?? [];
    root.appendChild(
      section(
        t('char.traits', 'الصفات الجينية', 'Genetic traits'),
        phenotype.length === 0
          ? el('div', { class: 'hint', text: t('char.noTraits', 'لا صفات ظاهرة.', 'No expressed traits.') })
          : el(
              'div',
              { class: 'col', style: 'gap:6px' },
              phenotype.map((tid) => {
                const info = traitInfo(tid, ctx.lang);
                return el('div', { class: 'card', style: 'margin:0' }, [
                  el('div', { class: 'row' }, [
                    el('span', { class: 'card-name', text: info.name }),
                    tag(`${t('char.rarity', 'ندرة', 'Rarity')} ${info.rarity}/5`, 'tag-gold'),
                  ]),
                  el('div', { class: 'card-sub', text: info.desc }),
                  el('div', { class: 'locked-note', text: info.origin }),
                ]);
              }),
            ),
      ),
    );

    // Equipment, skills, relationships.
    const equip = el('div', { class: 'chip-row' }, [
      el('span', { class: 'tag', text: `${t('char.weapon', 'السلاح', 'Weapon')}: ${c.equipment.weapon ?? '—'}` }),
      el('span', { class: 'tag', text: `${t('char.armor', 'الدرع', 'Armour')}: ${c.equipment.armor ?? '—'}` }),
      el('span', { class: 'tag', text: `${t('char.acc', 'الاكسسوار', 'Accessory')}: ${c.equipment.accessory ?? '—'}` }),
    ]);
    root.appendChild(section(t('char.equipment', 'المعدّات', 'Equipment'), equip));

    root.appendChild(
      section(
        t('char.skills', 'المهارات', 'Skills'),
        c.skills.length === 0
          ? el('div', { class: 'hint', text: t('char.noSkills', 'لا مهارات بعد.', 'No skills yet.') })
          : el('div', { class: 'chip-row' }, c.skills.map((s) => tag(s, 'tag-blue'))),
      ),
    );

    const rels = c.relationships ?? [];
    root.appendChild(
      section(
        t('char.relationships', 'العلاقات', 'Relationships'),
        rels.length === 0
          ? el('div', { class: 'hint', text: t('char.noRels', 'لا علاقات.', 'No relationships.') })
          : el(
              'div',
              { class: 'col', style: 'gap:4px' },
              rels.map((r) => {
                const other = ctx.store.getCharacter(r.targetId);
                const label = other ? `${other.firstName} ${other.familyName}` : r.targetId;
                return kv(label, `${r.affinity > 0 ? '+' : ''}${r.affinity} (${r.kind})`);
              }),
            ),
      ),
    );

    // Family links.
    root.appendChild(
      section(
        t('char.family', 'الصلة العائلية', 'Family links'),
        el('div', { class: 'col', style: 'gap:4px' }, [
          kv(t('char.father', 'الأب', 'Father'), nameOf(ctx, c.family.fatherId)),
          kv(t('char.mother', 'الأم', 'Mother'), nameOf(ctx, c.family.motherId)),
          kv(t('char.partners', 'الشركاء', 'Partners'), c.family.partnerIds.map((p) => nameOf(ctx, p)).join('، ') || '—'),
          kv(t('char.children', 'الأبناء', 'Children'), c.family.childIds.map((p) => nameOf(ctx, p)).join('، ') || '—'),
          kv(t('char.siblings', 'الأشقاء', 'Siblings'), c.family.siblingIds.map((p) => nameOf(ctx, p)).join('، ') || '—'),
        ]),
      ),
    );

    // Life history.
    root.appendChild(
      section(
        t('char.history', 'سجلّ الحياة', 'Life history'),
        c.history.length === 0
          ? el('div', { class: 'hint', text: t('char.noHistory', 'لا أحداث بعد.', 'No events yet.') })
          : el(
              'div',
              { class: 'col', style: 'gap:3px' },
              c.history
                .slice()
                .reverse()
                .slice(0, 30)
                .map((h) =>
                  el('div', { class: 'card-sub', text: `${h.year}/${h.day} — ${h.text}` }),
                ),
            ),
      ),
    );
  },
});

function row(label: string, value: string): HTMLTableRowElement {
  return el('tr', {}, [
    el('td', { text: label }),
    el('td', { class: 'num', text: value }),
  ]);
}

function nameOf(ctx: PanelContext, id?: string): string {
  if (!id) return '—';
  const c = ctx.store.getCharacter(id);
  return c ? `${c.firstName} ${c.familyName}` : '—';
}

/** Exposed for other panels that need to build a character card quickly. */
export { characterCard, hpRatio };
