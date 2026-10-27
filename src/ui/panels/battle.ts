/**
 * Combat panels: the normal battle preparation screen and the ranked arena.
 *
 * The two modes are deliberately kept in separate panels so a player can
 * never mistake one for the other. Normal battles incapacitate; ranked battles
 * kill permanently.
 */

import type { Character } from '../../game/simulation/types';
import {
  MAX_NORMAL_TEAM,
  MAX_RANKED_TEAM,
  applyBattleResult,
  canJoinTeam,
  estimateTeamStrength,
  isEligibleForBattle,
  resolveBattle,
  teamPower,
} from '../../game/simulation/systems/combat';
import { encountersAvailable } from '../../game/content/enemies';
import type { EncounterDef } from '../../game/simulation/types';
import { t } from '../../i18n';
import { button, el, section, tag } from '../dom';
import { portraitElement } from '../portrait';
import { conditionTag, identityLine } from './roster';
import { registerPanel, type PanelContext } from './types';

interface TeamPicker {
  root: HTMLElement;
  getTeam(): Character[];
  refresh(): void;
}

/** Builds the reusable party selection list with a hard member cap. */
function buildTeamPicker(ctx: PanelContext, max: number, mode: 'normal' | 'ranked'): TeamPicker {
  const selected: Character[] = [];
  const root = el('div', { class: 'col', style: 'gap:8px' });

  const counter = el('div', { class: 'row' }, [
    el('span', { class: 'muted', text: t('battle.selected', 'المختار', 'Selected') }),
    el('span', { class: 'badge-count', text: `0 / ${max}` }),
    el('span', { class: 'push muted', style: 'font-size:12px', text: t('battle.strength', 'القوة التقديرية', 'Estimated strength') }),
    el('span', { class: 'badge-count', id: 'team-strength', text: '0' }),
  ]);

  const list = el('div', { class: 'battle-side' });

  const refresh = () => {
    const countEl = counter.querySelector('.badge-count');
    if (countEl) countEl.textContent = `${selected.length} / ${max}`;
    const strengthEl = counter.querySelector('#team-strength');
    if (strengthEl) strengthEl.textContent = String(Math.round(estimateTeamStrength(selected)));

    while (list.firstChild) list.removeChild(list.firstChild);
    const roster = ctx.store.livingCharacters();

    if (roster.length === 0) {
      list.appendChild(el('div', { class: 'empty', text: t('battle.noTeam', 'لا أحد في العائلة ليقاتل.', 'Nobody in the household can fight.') }));
      return;
    }

    for (const c of roster) {
      const eligible = isEligibleForBattle(c);
      const isSelected = selected.some((s) => s.id === c.id);
      const row = el('div', {
        class: `combatant-row ${isSelected ? 'picked' : ''} ${eligible ? '' : 'dead'}`.trim(),
      });

      row.appendChild(portraitElement(c.race));
      row.appendChild(
        el('div', { class: 'col', style: 'gap:1px;flex:1;min-width:0' }, [
          el('div', { class: 'row tight' }, [
            el('span', { class: 'card-name', text: `${c.firstName} ${c.familyName}` }),
            tag(`${t('char.level', 'مستوى', 'Lv')} ${c.level}`),
            conditionTag(c),
          ]),
          identityLine(c, ctx.lang),
          el('div', { class: 'stat-row' }, [
            el('span', { html: `${t('char.hp', 'صحة', 'HP')} <b>${Math.round(c.health)}</b>` }),
            el('span', { html: `${t('char.dmg', 'ضرر', 'DMG')} <b>${Math.round(c.stats.damage)}</b>` }),
            el('span', { html: `${t('char.def', 'دفاع', 'DEF')} <b>${Math.round(c.stats.defense)}</b>` }),
            el('span', { html: `${t('char.sta', 'لياقة', 'STA')} <b>${Math.round(c.stats.stamina)}</b>` }),
            el('span', { html: `${t('char.power', 'قوة', 'PWR')} <b>${Math.round(teamPower(c))}</b>` }),
          ]),
        ]),
      );

      if (!eligible) {
        row.appendChild(el('span', { class: 'muted', style: 'font-size:11px', text: t('battle.ineligible', 'غير مؤهّل', 'Ineligible') }));
      } else {
        row.addEventListener('click', () => {
          const idx = selected.findIndex((s) => s.id === c.id);
          if (idx >= 0) {
            selected.splice(idx, 1);
          } else {
            const check = canJoinTeam(selected, c, mode);
            if (!check.ok) {
              ctx.notify(check.reason ?? t('battle.tooMany', 'لا يمكن تجاوز الحدّ الأقصى.', 'The maximum team size cannot be exceeded.'), 'warn');
              return;
            }
            selected.push(c);
          }
          refresh();
        });
      }
      list.appendChild(row);
    }
  };

  root.appendChild(counter);
  root.appendChild(list);
  refresh();
  return { root, getTeam: () => selected.slice(), refresh };
}

function battleLogPanel(lines: string[]): HTMLElement {
  const box = el('div', { class: 'battle-log' });
  for (const line of lines) {
    const cls = line.includes('☠') || line.includes('matat') || line.includes('قتُل')
      ? 'l-danger'
      : line.includes('✦') || line.includes('انتصار')
        ? 'l-ok'
        : '';
    box.appendChild(el('div', { class: cls, text: line }));
  }
  box.scrollTop = box.scrollHeight;
  return box;
}

registerPanel({
  id: 'combat',
  titleAr: 'القتال',
  titleEn: 'Battles',
  icon: '⚔',
  order: 40,
  size: 'wide',
  render(root, ctx) {
    const encounters = encountersAvailable(ctx.state);

    root.appendChild(
      el('div', { class: 'hint', text: t(
        'battle.hint',
        `القتال العادي: حتى ${MAX_NORMAL_TEAM} من أفراد العائلة. من ينهار يبقى حيًّا لكنه خارج القتال حتى يُعالَج.`,
        `Normal battle: up to ${MAX_NORMAL_TEAM} household members. The defeated are incapacitated, not killed.`,
      )}),
    );

    if (encounters.length === 0) {
      root.appendChild(el('div', { class: 'empty', text: t('battle.none', 'لا مواجهات متاحة الآن.', 'No encounters are available yet.') }));
      return;
    }

    const picker = buildTeamPicker(ctx, MAX_NORMAL_TEAM, 'normal');
    root.appendChild(section(t('battle.team', 'اختيار الفريق', 'Choose your team'), picker.root));

    root.appendChild(
      section(
        t('battle.encounters', 'المواجهات', 'Encounters'),
        el(
          'div',
          { class: 'col', style: 'gap:8px' },
          encounters.map((enc: EncounterDef) => {
            const card = el('div', { class: 'card' }, [
              el('div', { class: 'row' }, [
                el('span', { class: 'card-name', text: ctx.lang === 'ar' ? enc.nameAr : enc.nameEn }),
                tag(`${t('battle.stage', 'المرحلة', 'Stage')} ${enc.stage}`),
                enc.kind === 'boss' ? tag(t('battle.boss', 'زعيم', 'Boss'), 'tag-blood') : null,
                enc.kind === 'elite' ? tag(t('battle.elite', 'نخبة', 'Elite'), 'tag-gold') : null,
                enc.minLevel > 1 ? tag(`${t('char.level', 'مستوى', 'Lv')} ${enc.minLevel}+`) : null,
              ]),
              el('div', { class: 'card-sub', text: ctx.lang === 'ar' ? enc.descAr : enc.descEn }),
            ]);
            const fight = button(t('battle.fight', 'قاتل', 'Fight'), () => {
              const team = picker.getTeam();
              if (team.length === 0) {
                ctx.notify(t('battle.emptyTeam', 'اختر شخصًا واحدًا على الأقل.', 'Select at least one character.'), 'warn');
                return;
              }
              const result = resolveBattle(ctx.store, 'normal', enc.id, team.map((c) => c.id));
              applyBattleResult(ctx.store, result);

              const outcome = el('div', { class: 'col' }, [
                el('div', {
                  class: result.victory ? 'panel-title ok' : 'panel-title danger',
                  text: result.victory
                    ? t('battle.victory', 'انتصار', 'Victory')
                    : t('battle.defeat', 'هزيمة', 'Defeat'),
                }),
                battleLogPanel(result.log),
                el('div', { class: 'hint', text: t(
                  'battle.rewards',
                  `الغنائم: ${Object.entries(result.loot).map(([k, v]) => `${k} ${v}`).join('، ') || '—'} — الخبرة: ${Object.entries(result.xpGained).map(([k, v]) => `${k} +${Math.round(v)}`).join('، ') || '—'}`,
                  `Loot: ${Object.entries(result.loot).map(([k, v]) => `${k} ${v}`).join(', ') || '—'} — XP: ${Object.entries(result.xpGained).map(([k, v]) => `${k} +${Math.round(v)}`).join(', ') || '—'}`,
                )}),
              ]);
              if (result.incapacitated.length > 0) {
                outcome.appendChild(
                  el('div', { class: 'hint warn', text: t(
                    'battle.incapacitated',
                    `عاجز من سقط: ${result.incapacitated.length}. سيحتاجون إلى علاج قبل العودة للقتال.`,
                    `${result.incapacitated.length} were incapacitated and need healing before they can fight again.`,
                  )}),
                );
              }
              card.appendChild(outcome);
              picker.refresh();
              ctx.refresh();
            }, 'btn-sm btn-primary');
            card.appendChild(fight);
            return card;
          }),
        ),
      ),
    );
  },
});

registerPanel({
  id: 'ranked',
  titleAr: 'ساحة الترتيب',
  titleEn: 'Ranked Arena',
  icon: '💀',
  order: 41,
  size: 'wide',
  render(root, ctx) {
    // Ranked mode offers every encounter the player has access to: the mode
    // is about the stakes (permanent death), not about a separate ladder of
    // tougher enemies. Bosses and elites are flagged.
    const ranked = encountersAvailable(ctx.state);

    root.appendChild(
      el('div', { class: 'ranked-warning' }, [
        el('h4', { text: t('ranked.title', 'الموت هنا دائم', 'Death here is permanent') }),
        el('div', { text: t(
          'ranked.body',
          'في ساحة الترتيب، من يسقط يموت للأبد. لا تُبعث الأشباح، ولا يعود إلى الصفوف بعد الحفظ والتحميل. اختر بعناية — سلالتك كلها ترث هذا القرار.',
          'In the ranked arena, anyone who falls dies for good. No revival, no return after a save and reload. Choose carefully — the whole bloodline inherits this decision.',
        )}),
      ]),
    );

    if (ranked.length === 0) {
      root.appendChild(el('div', { class: 'empty', text: t('ranked.none', 'لا خصوم مُصنَّفون بعد.', 'No ranked opponents yet.') }));
      return;
    }

    const picker = buildTeamPicker(ctx, MAX_RANKED_TEAM, 'ranked');
    root.appendChild(section(t('battle.team', 'اختيار الفريق', 'Choose your team'), picker.root));

    for (const enc of ranked) {
      const card = el('div', { class: 'card' }, [
        el('div', { class: 'row' }, [
          el('span', { class: 'card-name', text: ctx.lang === 'ar' ? enc.nameAr : enc.nameEn }),
          tag(`${t('battle.stage', 'المرحلة', 'Stage')} ${enc.stage}`),
          enc.kind === 'boss' ? tag(t('battle.boss', 'زعيم', 'Boss'), 'tag-blood') : null,
        ]),
        el('div', { class: 'card-sub', text: ctx.lang === 'ar' ? enc.descAr : enc.descEn }),
      ]);

      const confirm = button(t('ranked.confirm', 'ادخل الساحة — موت دائم', 'Enter the arena — permanent death'), () => {
        const team = picker.getTeam();
        if (team.length === 0) {
          ctx.notify(t('battle.emptyTeam', 'اختر شخصًا واحدًا على الأقل.', 'Select at least one character.'), 'warn');
          return;
        }

        const names = team.map((c) => `${c.firstName} ${c.familyName}`).join('، ');
        const accepted = window.confirm(
          ctx.lang === 'ar'
            ? `تأكيد نهائي: ستدخل ${names} إلى ساحة الترتيب.\n\nإذا مات أي منهم، سيموت للأبد ولن يعود — حتى بعد الحفظ والتحميل.\n\nهل تريد المتابعة؟`
            : `Final confirmation: ${names} will enter the ranked arena.\n\nIf any of them die, they are gone for good — they will not return, even after a save and reload.\n\nContinue?`,
        );
        if (!accepted) return;

        const result = resolveBattle(ctx.store, 'ranked', enc.id, team.map((c) => c.id));
        applyBattleResult(ctx.store, result);

        const outcome = el('div', { class: 'col' }, [
          el('div', {
            class: result.victory ? 'panel-title ok' : 'panel-title danger',
            text: result.victory ? t('battle.victory', 'انتصار', 'Victory') : t('battle.defeat', 'هزيمة', 'Defeat'),
          }),
          battleLogPanel(result.log),
        ]);

        if (result.casualties.length > 0) {
          const names = result.casualties.map((id) => {
            const c = ctx.store.getCharacter(id);
            return c ? `${c.firstName} ${c.familyName}` : id;
          });
          outcome.appendChild(
            el('div', { class: 'ranked-warning', style: 'margin-top:8px' }, [
              el('h4', { text: t('ranked.casualties', 'سقطوا للأبد', 'Permanently lost') }),
              el('div', { text: names.join('، ') }),
              el('div', { style: 'margin-top:6px', text: t(
                'ranked.persisted',
                'سُجّل هذا الموت في تاريخ العائلة، ويبقى بعد إعادة تحميل اللعبة.',
                'These deaths are recorded in the family history and remain after reloading.',
              )}),
            ]),
          );
        }

        card.appendChild(outcome);
        picker.refresh();
        ctx.refresh();
      }, 'btn-sm btn-danger');

      card.appendChild(confirm);
      root.appendChild(card);
    }
  },
});
