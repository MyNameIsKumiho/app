/**
 * Output contract given to every Storyteller provider. Kept as text (not a
 * provider-specific schema feature) so any model can follow it; the response
 * is validated with Zod (TurnResultSchema) and repaired/retried on failure.
 */
export const TURN_RESULT_CONTRACT = `Ответь ОДНИМ JSON-объектом без пояснений и без markdown. Поля:
{
  "narrative": "художественный текст сцены (обязательно)",
  "timeAdvanceMinutes": 10,
  "stateChanges": [
    {"type":"resource","resourceId":"health","delta":-10,"reason":"..."},
    {"type":"item_add","itemId":"id-из-сценария","quantity":1} | для импровизированных предметов добавь "name" и "description",
    {"type":"item_remove","itemId":"...","quantity":1},
    {"type":"currency","currencyId":"...","delta":5},
    {"type":"xp","amount":20,"reason":"..."},
    {"type":"ability_learn","abilityId":"id-из-сценария"},
    {"type":"ability_mastery","abilityId":"...","delta":2},
    {"type":"effect_add","name":"...","description":"...","durationMinutes":60},
    {"type":"effect_remove","name":"..."},
    {"type":"move","locationId":"..."},
    {"type":"flag","key":"...","value":true},
    {"type":"player_knowledge","fact":"что герой узнал"},
    {"type":"achievement","achievementId":"..."}, {"type":"title","titleId":"..."}
  ],
  "relationshipChanges": [{"npcId":"...","axis":"trust","delta":5,"reason":"..."}],
  "newMemories": [{"owner":"npc-id или story","event":"что запомнилось","importance":0-100,"emotionalImpact":-100..100,"participants":["..."]}],
  "questChanges": [{"questId":"...","action":"start|complete_objective|complete|fail|note","objectiveId":"...","note":"..."}],
  "worldChanges": [{"description":"что изменилось в мире","importance":0-100,"flag":{"key":"...","value":true},"factionId":"...","reputationDelta":5}],
  "knowledgeChanges": [{"npcId":"...","fact":"что NPC узнал","secretId":"id секрета героя, если NPC его узнал","source":"player_told|observed|deduced|rumor"}],
  "npcUpdates": [{"npcId":"...","mood":"раздражение","locationId":"...","present":true,"alive":true}],
  "timelineChanges": [{"eventId":"...","action":"cancel|modify","note":"почему"}],
  "sceneChange": {"title":"название новой сцены","newArc":"название новой арки, только при крупном повороте"},
  "suggestedActions": [{"label":"коротко, до 6 слов","kind":"say|do|think|silent|ability|item|free","text":"готовый текст действия"}],
  "illustration": {"worthy": false, "description": "описание кадра, если сцена достойна иллюстрации"}
}
Правила:
- Используй только id, перечисленные в контексте. Пустые массивы можно опускать.
- Не дублируй механику, которую движок уже применил (стоимость способностей, использованные предметы).
- Изменения отношений небольшие (обычно ±1..10), только за реальные поступки.
- "newMemories" для NPC — только для присутствующих NPC и только о том, что они видели или слышали.
- Важные для всей истории события записывай в newMemories с owner "story" и importance ≥ 70.
- 3–5 suggestedActions, разных по смыслу; это лишь подсказки.
- illustration.worthy = true только для действительно ярких, поворотных сцен.`;
