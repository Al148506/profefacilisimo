import { describe, expect, it } from 'vitest';
import {
  applySubtype, applyType, draftFromSaved, hasSpecificContent,
  initialSpeakingContent, lessonDraftSchema, toActivityInput,
  type ActivityDraft, type SpeakingContent, type ValidatedActivityDraft,
} from './lesson-schema';
import type { LessonActivityDto } from './lesson-api';

const base = { key: 'a1', id: null, title: 'Actividad', instructions: 'Instrucciones', duration: 10 };

function speakingDraft(content: SpeakingContent): ActivityDraft {
  return { ...base, type: 'Speaking', content };
}

function saved(content: unknown, type: LessonActivityDto['type'] = 'Speaking'): LessonActivityDto {
  return { id: 'id-1', type, title: 'T', instructions: 'I', content, order: 0, estimatedDuration: 10 };
}

describe('applyType and subtypes', () => {
  it('opens a Speaking activity as Conversation with one empty questions block', () => {
    const draft = applyType({ key: 'k', id: null, title: '', instructions: '', duration: null }, 'Speaking');
    expect(draft.content).toEqual({ subtype: 'conversation', questionsText: '' });
  });

  it('starts each subtype with blank values that never count as content', () => {
    const roleplay = initialSpeakingContent('roleplay');
    expect(hasSpecificContent(speakingDraft(roleplay))).toBe(false);
    expect(hasSpecificContent(speakingDraft(initialSpeakingContent('presentation')))).toBe(false);
    expect(hasSpecificContent(speakingDraft(initialSpeakingContent('conversation')))).toBe(false);
  });

  it('applySubtype replaces only the Speaking content and keeps the shared fields', () => {
    const activity = speakingDraft({ subtype: 'conversation', questionsText: '¿Qué tal?' });
    const next = applySubtype(activity, 'presentation');
    expect(next.type === 'Speaking' && next.content).toEqual({ subtype: 'presentation', context: '', talkingPoints: [] });
    expect(next).toMatchObject({ key: 'a1', title: 'Actividad', instructions: 'Instrucciones', duration: 10 });
  });
});

describe('lessonDraftSchema with subtypes', () => {
  function validate(content: SpeakingContent) {
    return lessonDraftSchema.safeParse({
      title: 'Clase', level: 'B1', topic: '', objective: 'O',
      activities: [{ ...base, type: 'Speaking', content }],
    });
  }

  it('keeps the current conversation rules over the lines of the block', () => {
    expect(validate({ subtype: 'conversation', questionsText: 'P' }).success).toBe(true);
    expect(validate({ subtype: 'conversation', questionsText: ' P \n\nQ\n' }).success).toBe(true);
    expect(validate({ subtype: 'conversation', questionsText: '  \n\n ' }).success).toBe(false);
    expect(validate({ subtype: 'conversation', questionsText: Array.from({ length: 51 }, (_, i) => 'P' + i).join('\n') }).success).toBe(false);
    const tooLong = validate({ subtype: 'conversation', questionsText: 'P\n' + 'x'.repeat(2001) });
    expect(tooLong.success).toBe(false);
    if (!tooLong.success) {
      const issue = tooLong.error.issues.find((x) => x.path.join('.') === 'activities.0.content.questionsText');
      expect(issue?.message).toBe('Máximo 2000 caracteres por pregunta (línea 2).');
    }
  });

  it('accepts a complete roleplay and rejects the known mistakes', () => {
    const roleplay: SpeakingContent = {
      subtype: 'roleplay', context: 'Cena en un restaurante',
      roles: [{ name: 'Waiter', description: 'Toma el pedido' }, { name: 'Customer', description: '' }],
      objective: '', material: '', script: '', practiceMode: 'guided',
    };
    expect(validate(roleplay).success).toBe(true);
    expect(validate({ ...roleplay, context: '  ' }).success).toBe(false);
    expect(validate({ ...roleplay, roles: [{ name: 'Solo', description: '' }] }).success).toBe(false);
    expect(validate({ ...roleplay, roles: Array.from({ length: 7 }, (_, i) => ({ name: 'R' + i, description: '' })) }).success).toBe(false);
    expect(validate({ ...roleplay, roles: [{ name: 'x'.repeat(101), description: '' }, { name: 'B', description: '' }] }).success).toBe(false);
    expect(validate({ ...roleplay, roles: [{ name: 'A', description: 'x'.repeat(501) }, { name: 'B', description: '' }] }).success).toBe(false);
  });

  it('only the scripted mode requires a non-blank script', () => {
    const roleplay: SpeakingContent = {
      subtype: 'roleplay', context: 'Cena',
      roles: [{ name: 'A', description: '' }, { name: 'B', description: '' }],
      objective: '', material: '', script: '', practiceMode: 'guided',
    };
    const scripted = validate({ ...roleplay, practiceMode: 'scripted' });
    expect(scripted.success).toBe(false);
    if (!scripted.success) {
      const issue = scripted.error.issues.find((x) => x.path.join('.') === 'activities.0.content.script');
      expect(issue?.message).toBe('El modo «Con guion» requiere un guion.');
    }
    expect(validate({ ...roleplay, practiceMode: 'scripted', script: 'A: Hi!' }).success).toBe(true);
    expect(validate({ ...roleplay, practiceMode: 'free' }).success).toBe(true);
  });

  it('accepts a presentation without any question and enforces its own limits', () => {
    expect(validate({ subtype: 'presentation', context: 'Mi ciudad', talkingPoints: [] }).success).toBe(true);
    expect(validate({ subtype: 'presentation', context: 'Mi ciudad', talkingPoints: ['a', 'b'] }).success).toBe(true);
    expect(validate({ subtype: 'presentation', context: '', talkingPoints: [] }).success).toBe(false);
    expect(validate({ subtype: 'presentation', context: 'Ciudad', talkingPoints: [''] }).success).toBe(false);
    expect(validate({ subtype: 'presentation', context: 'Ciudad', talkingPoints: Array.from({ length: 21 }, (_, i) => 'p' + i) }).success).toBe(false);
  });
});

describe('draftFromSaved', () => {
  it('reads a legacy row without subtype as conversation, one question per line', () => {
    const draft = draftFromSaved(saved({ questionsList: ['¿Qué tal?'] }));
    expect(draft.type === 'Speaking' && draft.content).toEqual({ subtype: 'conversation', questionsText: '¿Qué tal?' });
  });

  it('reads a stored roleplay with every field', () => {
    const draft = draftFromSaved(saved({
      subtype: 'roleplay', context: 'Cena',
      roles: [{ name: 'Waiter', description: 'Toma el pedido' }, { name: 'Customer', description: null }],
      objective: null, material: null, script: 'A: Hi', practiceMode: 'scripted', questionsList: null,
    }));
    expect(draft.type === 'Speaking' && draft.content).toEqual({
      subtype: 'roleplay', context: 'Cena',
      roles: [{ name: 'Waiter', description: 'Toma el pedido' }, { name: 'Customer', description: '' }],
      objective: '', material: '', script: 'A: Hi', practiceMode: 'scripted',
    });
  });

  it('ignores unknown shapes instead of inventing content', () => {
    const draft = draftFromSaved(saved({ subtype: 'presentation', context: 'Ciudad', talkingPoints: ['a', 7] }));
    expect(draft.type === 'Speaking' && draft.content).toEqual({ subtype: 'presentation', context: 'Ciudad', talkingPoints: ['a', ''] });
  });
});

describe('hasSpecificContent', () => {
  it('treats initial blank rows as no content', () => {
    expect(hasSpecificContent(speakingDraft({ subtype: 'roleplay', context: '', roles: [{ name: ' ', description: '' }, { name: '', description: '  ' }], objective: '', material: '', script: '', practiceMode: 'scripted' }))).toBe(false);
  });

  it('detects content in any field of the current subtype', () => {
    expect(hasSpecificContent(speakingDraft({ subtype: 'roleplay', context: 'Cena', roles: [{ name: '', description: '' }, { name: '', description: '' }], objective: '', material: '', script: '', practiceMode: 'scripted' }))).toBe(true);
    expect(hasSpecificContent(speakingDraft({ subtype: 'presentation', context: '', talkingPoints: ['Un punto'] }))).toBe(true);
    expect(hasSpecificContent(speakingDraft({ subtype: 'presentation', context: '', talkingPoints: ['   '] }))).toBe(false);
  });
});

describe('toActivityInput', () => {
  function validated(activity: ActivityDraft): ValidatedActivityDraft {
    const result = lessonDraftSchema.safeParse({
      title: 'Clase', level: 'B1', topic: '', objective: 'O',
      activities: [activity],
    });
    if (!result.success) throw new Error(JSON.stringify(result.error.issues));
    return result.data.activities[0];
  }

  it('sends only the current subtype with blanks normalized to null', () => {
    const draft = speakingDraft({
      subtype: 'roleplay', context: 'Cena',
      roles: [{ name: 'Waiter', description: ' ' }, { name: 'Customer', description: 'Paga' }],
      objective: '', material: '', script: 'A: Hi', practiceMode: 'scripted',
    });
    expect(toActivityInput(validated(draft)).content).toEqual({
      subtype: 'roleplay', context: 'Cena',
      roles: [{ name: 'Waiter', description: null }, { name: 'Customer', description: 'Paga' }],
      objective: null, material: null, script: 'A: Hi', practiceMode: 'scripted',
    });
  });

  it('splits the conversation block into questions, keeping the wire payload as before', () => {
    const draft = speakingDraft({ subtype: 'conversation', questionsText: '¿Cómo te llamas?\n\n  ¿De dónde eres?  ' });
    expect(toActivityInput(validated(draft)).content).toEqual({
      subtype: 'conversation', questionsList: ['¿Cómo te llamas?', '¿De dónde eres?'],
    });
  });

  it('keeps talking points as sent when they are all filled', () => {
    const draft = speakingDraft({ subtype: 'presentation', context: 'Ciudad', talkingPoints: ['a', 'b'] });
    expect(toActivityInput(validated(draft)).content).toEqual({ subtype: 'presentation', context: 'Ciudad', talkingPoints: ['a', 'b'] });
  });

  it('a roleplay with the guided mode and a blank script still round-trips through the schema', () => {
    const draft = speakingDraft({
      subtype: 'roleplay', context: 'Cena',
      roles: [{ name: 'A', description: '' }, { name: 'B', description: '' }],
      objective: '', material: '', script: '   ', practiceMode: 'guided',
    });
    expect(toActivityInput(validated(draft)).content).toEqual({
      subtype: 'roleplay', context: 'Cena',
      roles: [{ name: 'A', description: null }, { name: 'B', description: null }],
      objective: null, material: null, script: null, practiceMode: 'guided',
    });
  });
});
