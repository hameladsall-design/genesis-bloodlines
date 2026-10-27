/**
 * World panels: factions, quests, the world map, settings and the tutorial.
 */

import { factionRelations, relationLabel } from '../../game/simulation/systems/factions';
import { acceptQuest, activeQuests, availableQuests } from '../../game/simulation/systems/quests';
import { ZONES } from '../../game/content/factions';
import { formatDate } from '../../game/simulation/calendar';
import { t, getLanguage, setLanguage } from '../../i18n';
import { button, el, kv, section } from '../dom';
import { registerPanel } from './types';

/* ------------------------------------------------------------------ */
/* Factions                                                           */
/* ------------------------------------------------------------------ */

registerPanel({
  id: 'factions',
  titleAr: 'الفرق',
  titleEn: 'Factions',
  icon: '⚑',
  order: 70,
  render(root, ctx) {
    const relations = factionRelations(ctx.state);

    root.appendChild(
      el('div', { class: 'hint', text: t(
        'factions.hint',
        'لكل فِرقية سكانها ومواردها وأعداؤها وسُمعة لك. السمعة السيئة تجرّهم إلى أبوابك.',
        'Each faction has its people, resources, enemies and their opinion of you. Bad standing invites them to your gates.',
      )}),
    );

    if (relations.length === 0) {
      root.appendChild(el('div', { class: 'empty', text: t('factions.none', 'لا فرق معروفة بعد.', 'No factions are known yet.') }));
      return;
    }

    for (const f of relations) {
      const cls = f.relation === 'ally' ? 'tag-forest' : f.relation === 'hostile' || f.relation === 'war' ? 'tag-blood' : f.relation === 'trade' ? 'tag-gold' : '';
      root.appendChild(
        el('div', { class: 'card' }, [
          el('div', { class: 'row' }, [
            el('span', { class: 'card-name', text: f.nameAr }),
            el('span', { class: `tag ${cls}`.trim(), text: relationLabel(f.relation, ctx.lang) }),
            el('span', { class: 'push muted', style: 'font-size:12px', text: `${t('factions.rep', 'السمعة', 'Standing')}: ${f.reputation}` }),
          ]),
        ]),
      );
    }
  },
});

/* ------------------------------------------------------------------ */
/* Quests                                                             */
/* ------------------------------------------------------------------ */

registerPanel({
  id: 'quests',
  titleAr: 'المهام',
  titleEn: 'Quests',
  icon: '❖',
  order: 71,
  render(root, ctx) {
    const active = activeQuests(ctx.state);
    const available = availableQuests(ctx.state);

    root.appendChild(
      section(
        t('quests.active', 'مهام جارية', 'Active quests'),
        active.length === 0
          ? el('div', { class: 'empty', text: t('quests.none', 'لا مهام جارية.', 'No active quests.') })
          : el(
              'div',
              { class: 'col' },
              active.map((q) =>
                el('div', { class: 'card' }, [
                  el('div', { class: 'card-name', text: ctx.lang === 'ar' ? q.titleAr : q.titleEn }),
                  el('div', { class: 'card-sub', text: ctx.lang === 'ar' ? q.descAr : q.descEn }),
                  el(
                    'div',
                    { class: 'col', style: 'gap:3px;margin-top:5px' },
                    q.objectives.map((o) =>
                      el('div', { class: 'card-sub', text: `• ${ctx.lang === 'ar' ? o.textAr : o.textEn} (${o.progress}/${o.target})` }),
                    ),
                  ),
                ]),
              ),
            ),
      ),
    );

    root.appendChild(
      section(
        t('quests.available', 'مهام متاحة', 'Available quests'),
        available.length === 0
          ? el('div', { class: 'hint', text: t('quests.noneAvail', 'لا مهام جديدة الآن.', 'Nothing new right now.') })
          : el(
              'div',
              { class: 'col' },
              available.map((q) => {
                const card = el('div', { class: 'card' }, [
                  el('div', { class: 'card-name', text: ctx.lang === 'ar' ? q.titleAr : q.titleEn }),
                  el('div', { class: 'card-sub', text: ctx.lang === 'ar' ? q.descAr : q.descEn }),
                ]);
                card.appendChild(
                  button(t('quests.accept', 'اقبل المهمة', 'Accept'), () => {
                    const ok = acceptQuest(ctx.store, q.id);
                    ctx.notify(
                      ok ? t('quests.accepted', 'قُبلت المهمة.', 'The quest was accepted.') : t('quests.acceptFail', 'تعذّر قبول المهمة.', 'The quest could not be accepted.'),
                      ok ? 'info' : 'warn',
                    );
                    ctx.refresh();
                  }, 'btn-sm'),
                );
                return card;
              }),
            ),
      ),
    );
  },
});

/* ------------------------------------------------------------------ */
/* World map                                                          */
/* ------------------------------------------------------------------ */

registerPanel({
  id: 'worldmap',
  titleAr: 'خريطة العالم',
  titleEn: 'World Map',
  icon: '🗺',
  order: 80,
  render(root, ctx) {
    const state = ctx.state;

    root.appendChild(
      el('div', { class: 'hint', text: t(
        'map.hint',
        'المستوطنة في المنتصف، وحولها مناطقٌ يسكنها غيرك. استكشفها لتجد مواد وغنائم ومرشّحين.',
        'Your settlement sits at the centre; regions around it are home to others. Explore them for materials, loot and recruits.',
      )}),
    );

    const map = el('div', {
      class: 'build-grid',
      style: 'grid-template-columns:repeat(4,1fr);max-height:none',
    });
    for (const zone of ZONES) {
      const unlocked = state.world.unlockedZones.includes(zone.id);
      const cell = el('div', { class: `build-tile ${unlocked ? 'occupied' : 'can-place'}`.trim(), style: 'aspect-ratio:auto;padding:8px 6px' }, [
        el('div', { class: 'card-name', style: 'font-size:12px', text: ctx.lang === 'ar' ? zone.nameAr : zone.nameEn }),
        el('div', { class: 'locked-note', text: unlocked ? `${t('map.danger', 'الخطورة', 'Danger')} ${zone.danger}` : t('map.locked', 'مغلق', 'Locked') }),
      ]);
      map.appendChild(cell);
    }
    root.appendChild(map);

    root.appendChild(
      section(
        t('map.stats', 'حالة العالم', 'World state'),
        el('div', { class: 'col', style: 'gap:4px' }, [
          kv(t('map.date', 'التاريخ', 'Date'), formatDate(state.calendar, ctx.lang)),
          kv(t('map.weather', 'الطقس', 'Weather'), state.weather),
          kv(t('map.seed', 'بذرة العالم', 'World seed'), state.world.seed),
          kv(t('map.size', 'حجم العالم', 'World size'), state.world.size),
          kv(t('map.nodes', 'عُقد الموارد', 'Resource nodes'), String(state.world.resourceNodes.length)),
          kv(t('map.zones', 'المناطق المفتوحة', 'Open regions'), String(state.world.unlockedZones.length)),
        ]),
      ),
    );
  },
});

/* ------------------------------------------------------------------ */
/* Settings                                                           */
/* ------------------------------------------------------------------ */

registerPanel({
  id: 'settings',
  titleAr: 'الإعدادات',
  titleEn: 'Settings',
  icon: '⚙',
  order: 90,
  render(root, ctx) {
    const lang = getLanguage();

    root.appendChild(
      section(
        t('set.language', 'اللغة', 'Language'),
        el('div', { class: 'row' }, [
          button('العربية', () => {
            setLanguage('ar');
            ctx.refresh();
          }, lang === 'ar' ? 'btn-primary' : ''),
          button('English', () => {
            setLanguage('en');
            ctx.refresh();
          }, lang === 'en' ? 'btn-primary' : ''),
        ]),
        el('div', { class: 'locked-note', text: t('set.langNote', 'العربية هي اللغة الأساسية، والإنجليزية متاحة كخيار.', 'Arabic is the primary language; English is available as an option.') }),
      ),
    );

    root.appendChild(
      section(
        t('set.saves', 'الحفظ', 'Saves'),
        el('div', { class: 'row' }, [
          button(t('set.save1', 'احفظ في الفتحة ١', 'Save to slot 1'), () => {
            const ok = ctx.engine.save(1);
            ctx.notify(ok ? t('set.saved', 'تم الحفظ.', 'Saved.') : t('set.saveFail', 'فشل الحفظ.', 'Save failed.'), ok ? 'info' : 'danger');
          }),
          button(t('set.saveAuto', 'احفظ تلقائيًا', 'Autosave'), () => {
            const ok = ctx.engine.save('auto');
            ctx.notify(ok ? t('set.saved', 'تم الحفظ.', 'Saved.') : t('set.saveFail', 'فشل الحفظ.', 'Save failed.'), ok ? 'info' : 'danger');
          }),
        ]),
        el(
          'div',
          { class: 'col', style: 'gap:3px;margin-top:8px' },
          ctx.engine.listSaves().map((s) =>
            kv(
              s.name,
              `${s.dynasty} · ${s.day}/${s.year} · ${s.population} ${t('set.residents', 'مقيم', 'residents')}`,
            ),
          ),
        ),
      ),
    );

    root.appendChild(
      section(
        t('set.danger', 'منطقة الخطر', 'Danger zone'),
        el('div', { class: 'hint', text: t(
          'set.dangerNote',
          'إعادة بدء اللعبة تمحو التقدّم الحالي.',
          'Restarting the dynasty erases the current progress.',
        )}),
        button(t('set.restart', 'ابدأ سلالة جديدة', 'Begin a new dynasty'), () => {
          if (window.confirm(t('set.restartConfirm', 'هل تريد بدء سلالة جديدة؟ سيُمحى التقدّم الحالي.', 'Begin a new dynasty? The current progress will be erased.'))) {
            window.location.reload();
          }
        }, 'btn-danger'),
      ),
    );
  },
});

/* ------------------------------------------------------------------ */
/* Tutorial                                                           */
/* ------------------------------------------------------------------ */

registerPanel({
  id: 'tutorial',
  titleAr: 'البداية',
  titleEn: 'Getting Started',
  icon: '📜',
  order: 1,
  render(root, ctx) {
    root.appendChild(
      el('div', { class: 'col', style: 'gap:10px' }, [
        el('div', { class: 'panel-title', text: t('tut.title', 'كيف تنجو سلالة', 'How a bloodline survives') }),
        el('div', { class: 'hint', text: t('tut.1', '١. اجمع الخشب والحجر من عُقد الموارد في العالم. انقر على العقدة في لوحة «الموارد».', '1. Gather wood and stone from resource nodes. Use the Resources panel.') }),
        el('div', { class: 'hint', text: t('tut.2', '٢. كل فرد حيّ يستهلك وحدة طعام يوميًا. راقب شريط الطعام في الأعلى.', '2. Every living member eats one food per day. Watch the food bar at the top.') }),
        el('div', { class: 'hint', text: t('tut.3', '٣. ارفع رتبة القاعدة بالخشب والحجر لتوسعة السعة وفتح مبانٍ جديدة.', '3. Upgrade the base with wood and stone to grow capacity and unlock buildings.') }),
        el('div', { class: 'hint', text: t('tut.4', '٤. ضمّ المقيمين من «حانة الوحوش»، وابرِم الزواج لتكوين الدم.', '4. Recruit residents at the Monster Tavern, and marry to make new blood.') }),
        el('div', { class: 'hint', text: t('tut.5', '٥. القتال العادي يعطيك طعامًا وخبرة. أمّا ساحة الترتيب فالموت فيها دائم.', '5. Normal battles bring food and experience. In the ranked arena, death is permanent.') }),
        el('div', { class: 'hint', text: t('tut.6', '٦. يعود زائر مرة كل شهر تقريبًا بعلامة تعجب حمراء فوق رأسه.', '6. A visitor arrives roughly every month with a red exclamation mark overhead.') }),
      ]),
    );

    const actions = el('div', { class: 'row', style: 'margin-top:12px' }, [
      button(t('tut.gather', 'ابدأ بجمع الخشب', 'Start by gathering wood'), () => {
        ctx.state.tutorialComplete = true;
        ctx.open('resources');
      }, 'btn-primary'),
      button(t('tut.skip', 'تخطَّ', 'Skip'), () => {
        ctx.state.tutorialComplete = true;
        ctx.close();
      }),
    ]);
    root.appendChild(actions);
  },
});
