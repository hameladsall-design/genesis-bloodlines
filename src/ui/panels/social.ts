/**
 * Social panels: the tavern, the monthly visitor, the family tree and the
 * genetics laboratory.
 */

import type { TavernCandidate, Visitor } from '../../game/simulation/types';
import { getSpecies, sexLabel } from '../../game/content/species';
import {
  BASE_RECRUIT_PRICE,
  marriageCandidates,
  recruitCandidate,
  tavernOffers,
  tavernSlotsFor,
} from '../../game/simulation/systems/tavern';
import { pendingVisitors, resolveVisitor, visitorRecruitPrice } from '../../game/simulation/systems/visitors';
import { buildFamilyTree, canMarry, marry } from '../../game/simulation/systems/family';
import { TRAITS } from '../../game/content/traits';
import { expressTraits, inheritTraitProbability, traitInfo } from '../../game/simulation/systems/genetics';
import { t } from '../../i18n';
import { button, el, section, tag } from '../dom';
import { portraitElement } from '../portrait';
import { identityLine } from './roster';
import { registerPanel, type PanelContext } from './types';

/* ------------------------------------------------------------------ */
/* Tavern                                                             */
/* ------------------------------------------------------------------ */

function candidateCard(candidate: TavernCandidate, ctx: PanelContext): HTMLElement {
  const c = candidate.character;
  const card = el('div', { class: 'tavern-card' });
  card.appendChild(portraitElement(c.race));

  const info = el('div', { class: 'col', style: 'gap:4px;flex:1;min-width:0' }, [
    el('div', { class: 'card-head' }, [
      el('span', { class: 'card-name', text: `${c.firstName} ${c.familyName}` }),
      tag(`${t('tavern.tier', 'رتبة', 'Tier')} ${candidate.tier}`),
    ]),
    identityLine(c, ctx.lang),
    el('div', { class: 'stat-row' }, [
      el('span', { html: `${t('char.hp', 'صحة', 'HP')} <b>${Math.round(c.stats.hp)}</b>` }),
      el('span', { html: `${t('char.dmg', 'ضرر', 'DMG')} <b>${Math.round(c.stats.damage)}</b>` }),
      el('span', { html: `${t('char.def', 'دفاع', 'DEF')} <b>${Math.round(c.stats.defense)}</b>` }),
      el('span', { html: `${t('char.sta', 'لياقة', 'STA')} <b>${Math.round(c.stats.stamina)}</b>` }),
    ]),
    el('div', { class: 'chip-row' }, (c.phenotype ?? []).slice(0, 4).map((tid) => tag(traitInfo(tid, ctx.lang).name, 'tag-blue'))),
  ]);

  const action = el('div', { class: 'col', style: 'gap:6px;justify-content:center' }, [
    el('div', { class: 'price-tag', text: `${candidate.price} ${t('tavern.coins', 'عملة', 'coins')}` }),
    button(t('tavern.hire', 'ضمّ إلى العائلة', 'Recruit'), () => {
      const result = recruitCandidate(ctx.store, candidate.id);
      if (!result.ok) {
        ctx.notify(result.reason ?? t('tavern.fail', 'تعذّر ضمّ المرشّح.', 'Could not recruit.'), 'danger');
        return;
      }
      ctx.notify(
        t('tavern.ok', 'انضمّ المرشّح إلى العائلة.', 'The candidate joined the household.'),
        'info',
      );
      ctx.refresh();
    }, 'btn-sm btn-primary'),
  ]);

  card.appendChild(info);
  card.appendChild(action);
  return card;
}

registerPanel({
  id: 'tavern',
  titleAr: 'حانة الوحوش',
  titleEn: 'Monster Tavern',
  icon: '🍺',
  order: 20,
  render(root, ctx) {
    const slots = tavernSlotsFor(ctx.store);
    const offers = tavernOffers(ctx.store);

    root.appendChild(
      el('div', { class: 'hint', text: t(
        'tavern.hint',
        `المقاعد المتاحة: ${slots}. السعر الأساسي ${BASE_RECRUIT_PRICE} عملة، والنادر أغلى. الاستضافة تملأ سعة القاعدة، أما الزواج فبندٍ منفصل تماماً.`,
        `${slots} slots available. Base price ${BASE_RECRUIT_PRICE} coins; rarer candidates cost more. Recruiting fills base capacity — marriage is a separate action entirely.`,
      )}),
    );

    if (offers.length === 0) {
      root.appendChild(el('div', { class: 'empty', text: t('tavern.empty', 'الحانة فارغة الليلة.', 'The tavern is empty tonight.') }));
      return;
    }

    for (const offer of offers) {
      root.appendChild(candidateCard(offer, ctx));
    }
  },
});

/* ------------------------------------------------------------------ */
/* Visitor                                                            */
/* ------------------------------------------------------------------ */

registerPanel({
  id: 'visitor',
  titleAr: 'الزائر',
  titleEn: 'Visitor',
  icon: '❗',
  order: 98,
  render(root, ctx) {
    const id = ctx.payload as string | undefined;
    const visitor = ctx.state.visitors.find((v) => v.id === id) as Visitor | undefined;

    if (!visitor) {
      const waiting = pendingVisitors(ctx.state);
      root.appendChild(
        section(
          t('visitor.waiting', 'زوّار بانتظار قرارك', 'Visitors awaiting your decision'),
          waiting.length === 0
            ? el('div', { class: 'empty', text: t('visitor.none', 'لا زائر الآن. يعود الزائر مرة كل شهر تقريبًا.', 'No visitor now. One arrives roughly once a month.') })
            : el(
                'div',
                { class: 'col' },
                waiting.map((v) =>
                  button(`${v.character.firstName} ${v.character.familyName} — ${getSpecies(v.character.race).nameAr}`, () => ctx.open('visitor', v.id), 'btn-sm'),
                ),
              ),
        ),
      );
      return;
    }

    const c = visitor.character;
    const species = getSpecies(c.race);
    const price = visitorRecruitPrice(ctx.store, visitor);

    root.appendChild(
      el('div', { class: 'row', style: 'align-items:flex-start;gap:14px' }, [
        portraitElement(c.race, false, true),
        el('div', { class: 'col', style: 'gap:4px;flex:1' }, [
          el('div', { class: 'card-head' }, [
            el('span', { class: 'card-name', style: 'font-size:16px', text: `${c.firstName} ${c.familyName}` }),
            tag(species.nameAr, 'tag-blood'),
          ]),
          identityLine(c, ctx.lang),
          el('div', { class: 'chip-row' }, [
            tag(`${t('char.level', 'مستوى', 'Level')} ${c.level}`),
            tag(sexLabel(c.sex, c.race, ctx.lang)),
            tag(`${t('char.dmg', 'ضرر', 'DMG')} ${Math.round(c.stats.damage)}`),
            tag(`${t('char.def', 'دفاع', 'DEF')} ${Math.round(c.stats.defense)}`),
          ]),
          el('div', { class: 'hint', text: ctx.lang === 'ar' ? species.descAr : species.descEn }),
        ]),
      ]),
    );

    if (visitor.disposition !== 'waiting') {
      root.appendChild(
        el('div', { class: 'empty', text: t('visitor.resolved', 'تم حسم هذا الزائر.', 'This visitor has already been resolved.') }),
      );
      return;
    }

    const actions = el('div', { class: 'col', style: 'gap:8px;margin-top:14px' });

    actions.appendChild(
      button(t('visitor.recruit', `ضمّه إلى العائلة (${price} عملة)`, `Recruit to the household (${price} coins)`), () => {
        const result = resolveVisitor(ctx.store, visitor.id, 'recruit');
        if (!result.ok) ctx.notify(result.reason ?? '—', 'danger');
        else ctx.notify(t('visitor.recruited', 'انضمّ الزائر إلى العائلة.', 'The visitor joined the household.'), 'info');
        ctx.refresh();
      }, 'btn-primary'),
    );

    actions.appendChild(
      button(t('visitor.kill', 'اقتل الزائر', 'Kill the visitor'), () => {
        const result = resolveVisitor(ctx.store, visitor.id, 'kill');
        if (!result.ok) ctx.notify(result.reason ?? '—', 'danger');
        else ctx.notify(t('visitor.killed', 'سقط الزائر، ولكن ثمن ذلك باهظ.', 'The visitor fell — at a cost.'), 'warn');
        ctx.refresh();
      }, 'btn-danger'),
    );

    actions.appendChild(
      button(t('visitor.send', 'أرسله بعيدًا', 'Send away'), () => {
        const result = resolveVisitor(ctx.store, visitor.id, 'send_away');
        if (!result.ok) ctx.notify(result.reason ?? '—', 'danger');
        else ctx.notify(t('visitor.sent', 'رحل الزائر.', 'The visitor departed.'), 'info');
        ctx.refresh();
      }),
    );

    root.appendChild(actions);
    root.appendChild(
      el('div', { class: 'locked-note', style: 'margin-top:8px', text: t(
        'visitor.note',
        'قتل الزائر يجلب غنائم لكنه يُنقض سمعتك مع فرقته، وقد يعود أحدهم يومًا غير متوقع.',
        'Killing a visitor yields loot but sours your standing with their faction — and someone may return.',
      )}),
    );
  },
});

/* ------------------------------------------------------------------ */
/* Family tree                                                        */
/* ------------------------------------------------------------------ */

registerPanel({
  id: 'family',
  titleAr: 'شجرة العائلة',
  titleEn: 'Family Tree',
  icon: '🌳',
  order: 30,
  render(root, ctx) {
    const tree = buildFamilyTree(ctx.state);

    root.appendChild(
      el('div', { class: 'hint', text: t(
        'family.hint',
        'كل من مات يبقى في السجلّ. الوارث التالي يورث الدم والملك معًا.',
        'Everyone who died stays on the record. The next heir inherits blood and crown alike.',
      )}),
    );

    if (tree.length === 0) {
      root.appendChild(el('div', { class: 'empty', text: t('family.empty', 'لا سلالة بعد.', 'No bloodline yet.') }));
      return;
    }

    const generations = new Map<number, typeof tree>();
    for (const node of tree) {
      const list = generations.get(node.generation) ?? [];
      list.push(node);
      generations.set(node.generation, list);
    }

    const wrap = el('div', { class: 'tree-wrap' });
    const ordered = [...generations.keys()].sort((a, b) => a - b);
    for (const gen of ordered) {
      const nodes = generations.get(gen)!;
      const block = el('div', { class: 'tree-gen' }, [
        el('h4', { text: t('family.gen', 'الجيل', 'Generation') + ' ' + gen }),
        el(
          'div',
          { class: 'tree-row' },
          nodes.map((node) => {
            const card = el('div', { class: `tree-node ${node.alive ? '' : 'dead'}`.trim() }, [
              el('div', { class: 'n', text: node.name }),
              el('div', { class: 'm', text: `${getSpecies(node.race).nameAr} · ${Math.floor(node.age)}` }),
              node.alive ? null : el('div', { class: 'm danger', text: t('family.dead', 'ميت', 'deceased') }),
            ]);
            card.addEventListener('click', () => ctx.open('character', node.id));
            return card;
          }),
        ),
      ]);
      wrap.appendChild(block);
    }
    root.appendChild(wrap);

    // Marriage.
    root.appendChild(
      section(
        t('family.marriage', 'الزواج والشراكة', 'Marriage and partnership'),
        marriageControls(ctx),
      ),
    );
  },
});

function marriageControls(ctx: PanelContext): HTMLElement {
  const container = el('div', { class: 'col' });
  const living = ctx.store.livingCharacters();

  if (living.length < 2) {
    container.appendChild(el('div', { class: 'hint', text: t('family.needTwo', 'تحتاج شخصين بالغين على الأقل.', 'At least two adults are required.') }));
    return container;
  }

  const family = living.filter((c) => c.household === 'family');
  const pool = family.length >= 1 ? family : living;

  const selectA = el('select', { class: 'input' }) as HTMLSelectElement;
  const selectB = el('select', { class: 'input' }) as HTMLSelectElement;
  for (const c of pool) {
    selectA.appendChild(el('option', { value: c.id, text: `${c.firstName} ${c.familyName} (${getSpecies(c.race).nameAr})` }) as HTMLOptionElement);
  }

  const status = el('div', { class: 'hint' });
  const partnerBox = el('div', { class: 'col', style: 'gap:4px' });

  /** Rebuilds the partner list from the real eligibility rules. */
  const refreshPartners = () => {
    while (selectB.firstChild) selectB.removeChild(selectB.firstChild);
    while (partnerBox.firstChild) partnerBox.removeChild(partnerBox.firstChild);

    const a = ctx.store.getCharacter(selectA.value);
    if (!a) return;

    const candidates = marriageCandidates(ctx.store, a);
    if (candidates.length === 0) {
      partnerBox.appendChild(
        el('div', { class: 'hint', text: t(
          'family.noPartner',
          'لا يوجد شريك متاح: إمّا بلغوا سنّ الرشد، أو Species غير متوافقة، أو هم مثبَّتون في زواجٍ آخر.',
          'No eligible partner: they may be under age, of an incompatible species, or already partnered.',
        )}),
      );
      return;
    }

    for (const c of candidates) {
      selectB.appendChild(el('option', { value: c.id, text: `${c.firstName} ${c.familyName} (${getSpecies(c.race).nameAr})` }) as HTMLOptionElement);
    }
    selectB.addEventListener('change', check);
    check();
  };

  const check = () => {
    const a = ctx.store.getCharacter(selectA.value);
    const b = ctx.store.getCharacter(selectB.value);
    if (!a || !b) return;
    const result = canMarry(a, b);
    status.textContent = result.ok
      ? t('family.can', 'يمكن إبرام الزواج بينهما.', 'They may wed.')
      : (result.reason ?? t('family.cannot', 'لا يمكن الزواج بينهما.', 'They may not wed.'));
  };

  selectA.addEventListener('change', refreshPartners);
  refreshPartners();

  container.appendChild(el('div', { class: 'row' }, [selectA, selectB]));
  container.appendChild(partnerBox);
  container.appendChild(status);
  container.appendChild(
    button(t('family.marry', 'أبرم الزواج', 'Contract the marriage'), () => {
      const a = ctx.store.getCharacter(selectA.value);
      const b = ctx.store.getCharacter(selectB.value);
      if (!a || !b) return;
      const ok = marry(ctx.store, a, b);
      ctx.notify(
        ok ? t('family.married', 'تمّ إبرام الزواج.', 'The marriage was contracted.') : t('family.marriageFail', 'تعذّر إبرام الزواج.', 'The marriage could not be contracted.'),
        ok ? 'info' : 'danger',
      );
      ctx.refresh();
    }, 'btn-sm'),
  );

  container.appendChild(
    el('div', { class: 'locked-note', text: t(
      'family.note',
      'الزواج منفصل كليًا عن الاستضافة: الاستضافة تجعل المقيم جزءًا من أفراد البيت، أما الزواج فيصنع دمًا جديدًا.',
      'Marriage is wholly separate from hiring: hiring makes a resident, marriage makes new blood.',
    )}),
  );

  return container;
}

/* ------------------------------------------------------------------ */
/* Genetics                                                           */
/* ------------------------------------------------------------------ */

registerPanel({
  id: 'genetics',
  titleAr: 'مختبر الجينات',
  titleEn: 'Genetics',
  icon: '🧬',
  order: 31,
  render(root, ctx) {
    const living = ctx.store.livingCharacters();

    root.appendChild(
      el('div', { class: 'hint', text: t(
        'genetics.hint',
        'كل صفة وراثية محسوبة فعليًا من الجينات، لا تخمينًا. اختر شخصين لترى احتمال انتقال الصفة إلى أبنائهما.',
        'Every trait is genuinely computed from the genotype, never guessed. Pick two people to see the chance of a trait passing to their children.',
      )}),
    );

    // Offspring simulator.
    const selectA = el('select', { class: 'input' }) as HTMLSelectElement;
    const selectB = el('select', { class: 'input' }) as HTMLSelectElement;
    for (const s of [selectA, selectB]) {
      for (const c of living) {
        s.appendChild(el('option', { value: c.id, text: `${c.firstName} ${c.familyName}` }) as HTMLOptionElement);
      }
    }
    if (living.length > 1) selectB.selectedIndex = 1;

    const resultBox = el('div', { class: 'col', style: 'gap:6px' });

    const update = () => {
      clearChildren(resultBox);
      const a = ctx.store.getCharacter(selectA.value);
      const b = ctx.store.getCharacter(selectB.value);
      if (!a || !b) return;

      resultBox.appendChild(
        el('div', { class: 'hint', text: t(
          'genetics.pair',
          `${a.firstName} × ${b.firstName} — الجينات المحتملة:`,
          `${a.firstName} × ${b.firstName} — possible offspring:`,
        )}),
      );

      const allTraits = Object.keys(TRAITS);
      const rows = allTraits
        .map((tid) => ({ tid, p: inheritTraitProbability(a, b, tid) }))
        .filter((r) => r.p > 0)
        .sort((x, y) => y.p - x.p);

      if (rows.length === 0) {
        resultBox.appendChild(el('div', { class: 'empty', text: t('genetics.none', 'لا صفة مشتركة محتملة.', 'No shared trait is possible.') }));
        return;
      }

      for (const r of rows.slice(0, 24)) {
        const info = traitInfo(r.tid, ctx.lang);
        resultBox.appendChild(
          el('div', { class: 'card', style: 'margin:0' }, [
            el('div', { class: 'row' }, [
              el('span', { class: 'card-name', text: info.name }),
              el('span', { class: 'push price-tag', text: `${Math.round(r.p * 100)}%` }),
            ]),
            el('div', { class: 'card-sub', text: info.desc }),
          ]),
        );
      }
    };

    selectA.addEventListener('change', update);
    selectB.addEventListener('change', update);

    root.appendChild(
      section(
        t('genetics.sim', 'محاكّي النسل', 'Offspring simulator'),
        el('div', { class: 'row' }, [selectA, selectB]),
        resultBox,
      ),
    );
    update();

    // Per-character traits.
    root.appendChild(
      section(
        t('genetics.known', 'الصفات المعروفة', 'Known traits'),
        el(
          'div',
          { class: 'col', style: 'gap:6px' },
          living.map((c) =>
            el('div', { class: 'card', style: 'margin:0' }, [
              el('div', { class: 'row' }, [
                el('span', { class: 'card-name', text: `${c.firstName} ${c.familyName}` }),
                el('span', { class: 'push muted', style: 'font-size:11.5px', text: `${getSpecies(c.race).nameAr}` }),
              ]),
              el(
                'div',
                { class: 'chip-row' },
                expressTraits(c.genotype).length === 0
                  ? [el('span', { class: 'muted', text: t('genetics.noTraits', 'لا صفات ظاهرة.', 'No expressed traits.') })]
                  : expressTraits(c.genotype).map((tid) => tag(traitInfo(tid, ctx.lang).name, 'tag-blue')),
              ),
            ]),
          ),
        ),
      ),
    );
  },
});

function clearChildren(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}
