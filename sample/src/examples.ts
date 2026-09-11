import type { ModelRequest } from 'postgres-to-entity';

export const examples: Record<string, { label: string; explanation: string; request: ModelRequest }> = {
  tickets: {
    label: 'Event tickets',
    explanation: 'One ticket → one entity. Find tickets by event and whether they were used.',
    request: {
      sql: 'CREATE TABLE tickets (\n  id UUID PRIMARY KEY,\n  event_name VARCHAR(24),\n  seat_number INTEGER,\n  used BOOLEAN,\n  buyer_email TEXT\n);',
      question: 'Which tickets for an event have not been used?', project: 'event-tickets',
      filters: [{table:'tickets',column:'event_name',operator:'eq'},{table:'tickets',column:'used',operator:'eq'}],
      privateFields:[{table:'tickets',column:'buyer_email'}],
      policies:[{table:'tickets',owner:'The event organizer’s wallet',expiration:'Until 7 days after the event; extend if rescheduled.'}]
    }
  },
  social: {
    label: 'Social network',
    explanation: 'Two tables: people and their posts. Each becomes an entity type.',
    request: {
      sql: 'CREATE TABLE users (\n  id UUID PRIMARY KEY,\n  username VARCHAR(24),\n  email TEXT\n);\n\nCREATE TABLE posts (\n  id UUID PRIMARY KEY,\n  author_id UUID REFERENCES users(id),\n  body TEXT,\n  likes INTEGER\n);',
      question: 'Which posts by a user have more than 10 likes?', project:'social-posts',
      filters:[{table:'posts',column:'author_id',operator:'eq'},{table:'posts',column:'likes',operator:'range'}],
      privateFields:[{table:'users',column:'email'}],
      policies:[
        {table:'users',owner:'The profile owner’s wallet',expiration:'90 days; the owner extends while the profile is active.'},
        {table:'posts',owner:'The author’s wallet',expiration:'30 days; the author chooses whether to extend.'}
      ]
    }
  },
  tasks: {
    label: 'To-do list',
    explanation: 'Find unfinished tasks and read their titles.',
    request: {
      sql:'CREATE TABLE tasks (\n  id UUID PRIMARY KEY,\n  title TEXT,\n  completed BOOLEAN\n);',
      question:'Which tasks are not completed?',project:'todo-list',
      filters:[{table:'tasks',column:'completed',operator:'eq'}],
      policies:[{table:'tasks',owner:'The task owner’s wallet',expiration:'30 days; the owner extends while the task is active.'}]
    }
  },
  notes: {
    label: 'Notes',
    explanation: 'Find public notes by notebook, then read their text.',
    request:{
      sql:'CREATE TABLE notes (id UUID PRIMARY KEY, notebook VARCHAR(16), text TEXT, metadata JSONB);',
      question:'Which public notes belong to a notebook?',project:'public-notes',
      filters:[{table:'notes',column:'notebook',operator:'eq'}],
      policies:[{table:'notes',owner:'The note author’s wallet',expiration:'90 days; the author extends while the note is useful.'}]
    }
  }
};
