# AI WORKFLOW

Goal: make the most of free tiers without slowing down. The repo is the shared memory. Every AI reads the same files, so no chat has to be re-explained.

## Files every AI must be given

Paste or attach these at the start of a session (they are short on purpose):

1. `PROJECT_NOTES.md` (rules)
2. `docs/VISION.md` (what we are building)
3. The ONE ticket from `docs/tasks/` being worked on
4. Only the source files that ticket names

Do not paste the whole repo or old chats.

## Who does what

| Tool | Best used for | Avoid using it for |
| ---- | ------------- | ------------------ |
| Claude | Blender work (only Claude can drive it), architecture and trade-offs, reviewing a diff, tricky bugs that span files, final integration | Boilerplate, repetitive modules, long brainstorming |
| GitHub Copilot | Writing and editing code inside the editor, small modules, debugging with the code open, tests, refactors | Deciding architecture |
| ChatGPT | Design writing, JSON content (resources, recipes, dialogue drafts), naming, copy, concept ideas | Final say on code that touches several files |
| Gemini | Reading long documents, research, comparing libraries, summarising | Writing code that must match the repo exactly |

Rule of thumb: spend Claude on things only Claude can do or things that are expensive to get wrong. Everything else goes to the other three.

## The loop

1. **Spec** (ChatGPT or Gemini, or Claude if architectural): write a ticket from `docs/tasks/_TEMPLATE.md`. Commit it.
2. **Build** (Copilot): one branch per ticket, named `t003-inventory`. Small commits.
3. **Run**: Nicholas runs `npm run dev`, tries it, and writes what happened in the ticket under "Result".
4. **Review** (Claude, only if needed): give Claude the ticket and the diff, not the whole repo.
5. **Log**: update `DEVLOG.md`, merge, pick the next ticket.

## Keeping the pieces compatible

- Modules talk through small documented interfaces, written in the ticket before anyone codes.
- Game data lives in JSON under `data/` with the schema described in its ticket. Any AI can add content without touching code.
- One AI per ticket. If two AIs edit the same file, merge conflicts waste more time than they save.
- Each ticket ends with a check Nicholas can do by hand ("walk to the door, press E, the door opens").

## Saving Claude's usage

- Start a fresh session per ticket. Long chats cost more every message.
- Point Claude at file paths instead of pasting code.
- Ask for the whole job in one message, with the ticket, rather than many small questions.
- Keep big attachments out of Claude sessions. Use Gemini to summarise them into the docs.
- Blender work is batched: describe a whole set of pieces, let Claude build and export them in one go.
- If Claude hits its limit mid-task, the ticket says what is done and what is left, so another AI can continue.
