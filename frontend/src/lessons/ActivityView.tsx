import { Fragment } from 'react';
import type { LessonActivityDto } from './lesson-api';
import type { ActivityType } from './lesson-schema';

/** Frozen by the contract (C4): the player composes this component with a server activity. */
export type ActivityViewProps = { activity: LessonActivityDto };

/**
 * Read-only presentation of one activity during a lesson. It shows the instructions every type
 * carries and then the content of its own type, and nothing else: there is no form, no control and
 * no state here.
 *
 * `Type` is the authoritative discriminator, exactly as in the editor, and the JSONB content is read
 * defensively — a missing or unexpected value renders nothing rather than inventing content.
 *
 * Every string is passed to React as a child, so it is always text: this component never uses
 * `dangerouslySetInnerHTML` and HTML typed into the editor can never execute here.
 *
 * The class names and the `player-instructions` hook are the ones frozen by the contract (C3) and
 * belong to the player stylesheet written by another flow; this component only consumes them.
 */
export default function ActivityView({ activity }: ActivityViewProps) {
  const content = (activity.content ?? {}) as Record<string, unknown>;
  return <section className="player-activity">
    <p className="player-activity-instructions" data-testid="player-instructions">{activity.instructions}</p>
    {typeBody(activity.type, content)}
  </section>;
}

/**
 * The type-specific part of the body, in the persisted order. An unknown type renders nothing: the
 * instructions still show and the player does not invent content for a type it does not know.
 */
function typeBody(type: ActivityType, content: Record<string, unknown>) {
  switch (type) {
    case 'Speaking':
      return speakingBody(content);
    case 'Reading':
      return <>
        <ActivityParagraph className="player-activity-text" value={asText(content.text)} />
        <ActivityItems values={asItems(content.questionsList)} />
      </>;
    case 'Writing':
      return <ActivityParagraph className="player-activity-prompt" value={asText(content.prompt)} />;
    case 'VocabularyGrammar':
      return <>
        <ActivityParagraph className="player-activity-explanation" value={asText(content.explanation)} />
        <ActivityItems values={asItems(content.exercises)} />
      </>;
    default:
      return null;
  }
}

/** Rows before SPEC 09 (and unknown values) read as conversation, exactly like the domain. */
function asSubtype(value: unknown): string {
  return value === 'roleplay' || value === 'presentation' ? value : 'conversation';
}

function speakingBody(content: Record<string, unknown>) {
  const subtype = asSubtype(content.subtype);
  if (subtype === 'roleplay') {
    return <>
      <ActivityLabeled label="Situación:" value={asText(content.context)} />
      <ActivityItems values={asRoles(content.roles)} />
      <ActivityLabeled label="Objetivo:" value={asText(content.objective)} />
      <ActivityLabeled label="Material de apoyo:" value={asText(content.material)} />
      <ActivityScript value={asText(content.script)} />
    </>;
  }
  if (subtype === 'presentation') {
    return <>
      <ActivityLabeled label="Tema:" value={asText(content.context)} />
      <ActivityItems values={asItems(content.talkingPoints)} />
    </>;
  }
  return <ActivityItems values={asItems(content.questionsList)} />;
}

/** A roleplay paragraph with its label; a blank value renders nothing rather than inventing content. */
function ActivityLabeled({ label, value }: { label: string; value: string }) {
  if (value.trim() === '') return null;
  return <p className="player-activity-text"><strong>{label}</strong>{' ' + value}</p>;
}

/** The script keeps its line breaks as real breaks, never as new elements. */
function ActivityScript({ value }: { value: string }) {
  if (value.trim() === '') return null;
  return <p className="player-activity-text">
    {value.split('\n').map((line, index) => <Fragment key={index}>{index > 0 && <br />}{line}</Fragment>)}
  </p>;
}

/** One line per participant: name plus optional description; malformed roles are dropped. */
function asRoles(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((role) => {
    const item = (role ?? {}) as Record<string, unknown>;
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (name === '') return [];
    const description = typeof item.description === 'string' ? item.description.trim() : '';
    return [description === '' ? name : name + ' — ' + description];
  });
}

/** A block of text that only exists when it has something to show. */
function ActivityParagraph({ className, value }: { className: string; value: string }) {
  if (value.trim() === '') return null;
  return <p className={className}>{value}</p>;
}

/** The numbered list shared by the types that ask questions or exercises, shown as one block. */
function ActivityItems({ values }: { values: string[] }) {
  if (values.length === 0) return null;
  return <ol className="player-activity-list">
    {values.map((value, index) => <li key={index}>{value}</li>)}
  </ol>;
}

/** A missing or non-string value reads as empty text; nothing is invented. */
function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** The entries that exist and carry content; anything else is dropped rather than invented. */
function asItems(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
}
