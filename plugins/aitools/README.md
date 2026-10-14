# aitools

A one-row bar above the prompt showing how close your Claude subscription is to its limits, and what the work would
cost at Anthropic API list prices.

```
AI Tools    5h 42%, 1h12m    wk 18%, Thu    ctx 31% 62k/200k    tok 1.3M (+48k)    cache 42m, $0.50    thread $3.12 (+$0.41)    month $184.20    limit ~3:40pm   [🛠] [⁝]
```

| Segment | Meaning |
|---|---|
| Clawd | The mascot, at the start of the bar in the desktop Code tab only (see below) |
| `AI Tools` | A dim title naming the bar |
| `5h 42%, 1h12m` | 5-hour usage window: percent used, time until it resets |
| `wk 18%, Thu` | Weekly window: percent used, the day it resets (hours when under a day) |
| `ctx 31% 62k/200k` | Context window fill: percent and tokens used / window size |
| `tok 1.3M (+48k)` | Tokens: this thread's total this month (its helpers' included) and the last turn's, counting input, output and prompt-cache reads and writes |
| `cache 42m` | How long the prompt cache should stay warm: Claude Code writes the main conversation's cache with a 1-hour TTL, restarted by every request. Amber under 10 minutes, `cache cold` once expired. An estimate from request times; the API does not report cache state, and Anthropic may evict early |
| `cache 42m, $0.50` | What a cold cache costs the next message: the whole context written to the cache again at the model's 1-hour cache-write price (list prices, `~` for a model priced by its family), where a warm cache reads it for a small fraction of that. Shown after the cache time (`cache 42m, $0.50`, or `cache cold, $0.50` once it has lapsed), or as `cache $0.50` with cache warmth off. It's an upper bound: the context figure includes the last reply |
| `thread $3.12` | This session's cost at API prices |
| `(+$0.41)` | What the last turn cost (`last $0.41` when thread cost is hidden) |
| `~2.1% wk (+0.03%)` | Thread cost %: the thread's and the last turn's estimated share of your weekly allowance (see below) |
| `month $184.20` | This calendar month's Claude Code usage at API prices, across all sessions on this machine |
| `limit ~3:40pm` | At your pace over the last hour, when the 5-hour window would run out; shown only if before it resets |

Labels are dim and values a lighter grey; usage and context values turn yellow at 70% and red at 90%. A value not known yet shows `-`; until the first response of a
session the bar shows the figures from your previous session.

## Show or hide the bar

`/aitools` toggles the whole bar (buttons included); `/aitools on` and `/aitools off` set it. The choice holds across
sessions. `/handoff` works either way.

## Settings

Press **⁝** (`opts` in the terminal) to open the **AI Tool Settings** pane; press it again, or the pane's own close
mark, to close it. Opening it closes the **🛠** menu. Clawd stands at its top left in a hard hat, cranking a cog (on the
desktop), beside the files the settings are saved in. Every option, or every meter with its options, gets a row,
in two sections:

```
Global Settings  May be overridden by project settings
● Show mascot       Clawd, acting out what Claude is doing
● Show title        AI Tools at the start of the bar
● Threshold colors  Yellow from 70%, red from 90%; a cache about to go cold
● Show project row  A second row: repo, board, issue and tools, in every project
Meters
  5-hour            ● Percent  ● Reset  5h 42%, 1h12m
  Weekly            ● Percent  ● Reset  wk 18%, Thu
  Context           ● Percent  ● Tokens  ctx 31% 62k/200k
  Tokens            ● Thread  ● Last turn  tok 1.3M (+48k)
  Cache             ● Time left  ● Cold cost  cache 42m, $0.50
  Thread cost       ● Thread  ● Last turn  ● Weekly share
                    thread $3.12 (+$0.41) ~2.1% wk
  Month             ● Cost  month $184.20
  Burn rate         ● Warning  limit ~3:40pm

Project Settings  Saved for vowelit only
● Show project row  The row in vowelit
  Name              [Vowelit                                   ]
                    In place of the repo's name
● Board             Its open items on the row, and the Project pane
  Board URL         [https://github.com/users/pkkid/projects/1 ]
  Tools             Server · Test · Docs. Edit project.tools in the file.
```

**Global Settings** holds the bar's display options. First the bar's own: show mascot (offered on the
desktop only), show title, threshold colors and show project row (in every project). Then each meter in the bar is one row, its options beside its name and
a sample of it after them, all under **Meters** in the order the bar shows them: 5-hour, weekly, context, tokens, cache,
thread cost, month and burn rate. A meter shows while any of its options is on. The **🛠** button always
shows.

Global Settings are saved for all your projects, in your settings file. **Project Settings** are saved for the
project, in its own file, and show only in a GitHub repository: **Show project row** (whether the row shows here,
when the global one is on too),
the name it shows, and its board (off, or its URL). Each heading says where its settings go. Type a name or URL and
press Enter to save it; an empty field goes back to the repository's name or the board looked up for it, and a URL
that isn't a GitHub Project's is refused with a line saying why. These are written to the project
file (see [Project row](#project-row)); its tools are edited in the file itself.

Changes show in the bar right away and are saved across sessions. An option that is off does no work in the
background: the transcript scan runs only for monthly cost, thread tokens or thread cost %; the cost lookups only for
the cost options; the mascot follows nothing while hidden. (Request times are kept either way: `/keepwarm` needs them.) Turned back on, an
option catches up at once, except the burn-rate warning, which needs fresh samples (a few responses) to project
from. Hiding the bar with `/aitools off` stops all of it.

### The settings file

Everything the mod's controls change is saved to `~/.claude/aitools.json` (`$CLAUDE_CONFIG_DIR/aitools.json` when
that is set): the display options (the project row among them), `/aitools on|off`, the view, and the Background tasks and Branches panes'
picks. The first run writes every setting into it, taking over what earlier versions kept in the mod's own store, so
the file lists everything there is to change. Edit it by hand and the bar follows within 30 seconds, when **⁝** opens,
or at once when Claude edits it. A file that isn't valid JSON is left alone: the settings stay as they were, and one
dim line in the chat says what's wrong.

```json
{
  "bar": {
    "hidden": false,
    "show": { "mascot": true, "label": true, "projectRow": true, "fiveHour": true, "cacheWarmth": true, "coldCost": true, "...": true }
  },
  "view": { "tasks": false, "clean": false },
  "subagents": { "showing": "all", "hideAfter": "never" },
  "branches": { "where": "both", "show": "all" }
}
```

A write reads the file again first and changes only its own keys, so anything else in it stays. The display options
are always written here; a project's own `.claude/aitools.json` gets only what you set under Project Settings (see
[Project row](#project-row)).

## Mascot

In the desktop Code tab, Clawd, Claude Code's pixel mascot, stands at the start of the bar (48 × 20 px) and acts out
what Claude is doing. Every pose is animated, and a change of pose plays a short transition first: he walks over to his
laptop or paper, sits down to sleep, jolts awake.

| Pose | When |
|---|---|
| Waving | A new session starts (a few seconds) |
| Standing | Nothing is running: breathing, blinking, glancing around |
| Typing | A turn is running: tapping at a laptop beside him, code typing out on its screen |
| Reading | A read-only tool runs (Read, Grep, Glob, a web fetch or search): reading a sheet of paper |
| Puzzled | A question waits on you: an open AskUserQuestion dialog, or a reply that ends with a question mark. Your next prompt settles it |
| Celebrating | A turn finishes with an answer (a few seconds, then Standing) |
| Oops | A tool call fails or is refused, or a turn is interrupted or fails (a few seconds) |
| Sleeping | Standing idle for 5 minutes; your next prompt wakes him |

He is SVG, so he never shows in the terminal, and **Mascot** in the settings pane (on by default) is offered on the
desktop only.

## Handoff

`/handoff` asks the current conversation for a brief (goal, current state, decisions, open tasks, key
files, next step), prints it in the chat as formatted text, and copies the raw markdown to the clipboard. Paste it into a new session to
continue there. The brief is a command output row, so the current session's model reads it too.

The **🛠** button opens a row above the bar with **Handoff**, **Notes**, **Tasks**, **Branches**, **Project** (in a
GitHub repository), **Task View** and **Clean View**, right-aligned; press it again to close the row without picking. **Handoff** writes the same brief into a **Handoff brief** pane, drawn as formatted text with
a **Copy** button; nothing is copied until you press it, and the brief stays out of the chat (so the current session's
model does not read it).

## Keep the cache warm

Stepping away for longer than an hour lets the prompt cache lapse, and the next message pays to write the whole
context again (the dollar figure after the cache time on the bar). `/keepwarm` holds it warm while you are gone: 5 minutes before the
cache's hour is up, it sends one small request over the conversation, which reads the cache and restarts its hour.

```
/keepwarm             keep warm for 6 hours
/keepwarm 90m         for a time of your own (also 2h30m, 10h)
/keepwarm status      time left, the next ping, and what the last ping read and cost
/keepwarm off         stop
/keepwarm help        these lines
```

While it runs, a ☼ shows left of **🛠** (`tools` in the terminal), right of **?** when that shows.

- A ping is `$.model.fork`: the conversation exactly as Claude last sent it, plus "Reply with the single word: warm".
  It reads the cached context (about $0.01 for 62k tokens on Opus 5.5), and nothing joins the conversation.
- No ping while Claude is working (its own requests keep the cache warm), before the session's first request, after
  compaction until the next request, or when the cache would stay warm past the window's end anyway.
- A cache that has already lapsed is never pinged: that would pay the full write every hour. Pings start again after
  your next message.
- Each ping's readback is checked. If it read nothing, or wrote a tenth of what it read or more, the cache was already
  gone, and keepwarm stops. A failed ping (an API error, an interruption, an empty reply) stops it too. Either way a
  dim line in the chat and `/keepwarm status` say why.
- The window belongs to this session and is kept across a restart of it, until its time is up.
- Claude Code must be left running, and the main cache must have the 1-hour lifetime: subscription use has it by
  default; API-key and cloud-provider sessions need `promptCacheTtl` set to `"1h"`.

The logic follows [cache-tax](https://github.com/karanb192/cache-tax)'s keepwarm, pinging 5 minutes before the hour
where cache-tax pings after 50 idle minutes.

## Ask as choices

When Claude ends an answer with questions for you in plain text, `/askme` asks them again as pop-up questions
with clickable options. Claude's recommended option comes first, marked "(Recommended)", and each option says
what picking it means. Yes-or-no confirmations come four to a question, and you can always type your own answer
under "Other". Anything typed after the command is passed along as a note, as in `/askme only the M2 ones`.
After you answer, Claude sums up the decisions and carries on.

You don't have to type the command: when Claude's last answer asks you something and it hasn't already used the
pop-up for that request, a **?** button appears just left of **🛠** (`tools` in the terminal). It goes away once
you send your next prompt. Pressing it sends `/askme` straight away. If it can't, because Claude is still working
or the prompt was refused, it puts `/askme` in the prompt box for you to send. Anything you had typed there stays,
after the command, and goes along as its note. Only a question mark right after a word counts: a bare **?**, or one
inside code or a link, doesn't.

## Notes

**Notes** in the **🛠** menu opens a **Notes** pane with one text box for a single scratch note. It is kept in
`.claude/notes.md` under the project root, a plain Markdown file you can open anywhere else too, and saved as you
type. **Copy**, at the end of the line above the box, copies the note to the clipboard. Add `.claude/notes.md` to the
project's `.gitignore` if it should stay out of git.

Click in the box to type. Enter starts a new line, the arrows, Home and End move the cursor (Ctrl+A and Ctrl+E too),
Page Up and Page Down move ten rows, and Backspace and Delete remove. Escape hands the keys back to the prompt. There
is no selection or undo. Pasting works in the terminal but not in the desktop app, where a mod cannot read the
clipboard; paste into `.claude/notes.md` in another editor and reopen the pane instead. The pane stays open until you close it, and comes back after the mod reloads.
Where a surface cannot draw the box (VS Code, the mobile app), the pane says where the note is kept instead.

## Task View and Clean View

Two views from the **🛠** menu, each turned on and off on its own: **Task View** draws Claude's work as a checklist in
the bar, and **Clean View** hides Claude's work in the chat, leaving its final replies. In the menu a ● marks a view
that is on and a ○ one that is off; picking one turns it on or off. The choices hold across sessions (`view.tasks` and
`view.clean` in the settings file; a file from when the views were one choice reads `"task"` as Task View and
`"clean"` as both).

While a view is on, its name shows in the status line under the prompt (both, comma separated). `/taskview` and
`/cleanview` do the same as the menu from the prompt: no argument toggles that view, `on` turns it on and `off` turns
it off.

The checklist sits between the bar's top row and the project row (an open menu still shows above the bar): done steps
marked with a green ✓, the step in progress with a blue ●, steps not started with a dim ○. Its title row starts with
**▾**, which folds the list to that row for the session (**▸** opens it again), and ends with how many steps are done
and **×**, which closes the list until your next prompt; Claude updating it meanwhile leaves it closed.

```
▾ Adding dark mode                                                3 of 5 ×
✓ Read the theme code                                       100% ▰▰▰▰▰▰
✓ Add the color tokens                                      100% ▰▰▰▰▰▰
● Wire up the toggle                                         40% ▰▰▱▱▱▱
○ Update tests                                                0% ▱▱▱▱▱▱
○ Run checks                                                  0% ▱▱▱▱▱▱
```

Each step has a bar: full once done, empty until it starts, and for the step in progress Claude's own estimate of how
far along it is, which moves each time Claude updates the checklist (the note asks for about every quarter of a step).

- **Task View** shows the checklist and leaves the chat as it is (only the checklist tool's own rows are hidden).
- **Clean View** hides every tool call and everything Claude writes while it works; only the final reply of each
  finished request stays. It hides tool calls and in-progress replies already in the chat too. With Task View on as
  well, the checklist is what shows the work meanwhile.

While Task View is on, each prompt you send carries a hidden note asking Claude to plan the work as plain-language
steps and report them through the mod's `checklist` tool (`mcp__aitools__checklist`), updating it as each step starts and
finishes. The mod answers that tool itself, before Claude Code's permission check, so it
should not ask for permission. Each new prompt starts a fresh checklist;
once every step is done and Claude stops, it folds to one line, `✓ Done: <title> (<n> steps)`, with a **×** at its
right end that closes it. A quick question that
needs no work gets no checklist.

While Clean View is on, each prompt also carries a note asking Claude not to narrate between steps and to put what
you need in a brief final reply. Clean View recognizes a final reply as the last thing Claude wrote before your next
prompt. It reads them from the
conversation when the mod loads (so replies from before a reload or restart still show) and adds each new one as a
request finishes.

## Background tasks

While any background task runs, the [project row](#project-row) counts them (`1 bg task`, `3 bg tasks`); pressing it
opens the Background tasks pane. **Tasks** in the **🛠** menu opens it too (where
there is no project row), and `/tasks` opens it, or closes it if open; the pane's own close mark closes it. It stays
open until you close it, and comes back after the mod reloads.

On the desktop, Clawd stands left of the pane's option rows with a mini Clawd stacked on his head for each task
running in the list (the stack stops growing at four), and sleeps in quiet grey when none is. The header line under
the options sits beside him too. The terminal has no picture.

Every subagent, workflow agent and monitor of the session gets a line, whether the pane is open or not, one per line
with its type:

- **Subagent**: a subagent Claude starts with its Agent tool (foreground or background).
- **Workflow**: an agent of a workflow Claude starts, named after the workflow (`review-changes · agent 3`, since a
  workflow's agents have no names of their own).
- **Monitor**: a monitor watching a command's output or a socket: its description, then what it watches.

Shell commands run in the background get no line: Claude Code offers no way to ask whether one is still running, so a
line whose end notice was missed would stay running for good. Claude Code lists them itself.

The ones running come first (oldest first), then the finished ones, the most recently finished first. Marks are Task
View's: a blue ● running, a ✓ done, a red × failed, and a dim × stopped (killed by you or Claude). A running task's
name is a lighter grey, followed in dim grey by what it is doing (a subagent's latest tool call, `Reading bar.tsx`, or
what a monitor watches) and its running time. A line's name and what it is doing take the room the pane's width
leaves, cut with `…` at the edge. A finished line is all dim (but a failed one's ×): no bar, just how long it ran and
how long ago it finished, `0:09 (3m ago)`.

```
Showing: [All] Subagents  Workflows  Monitors
Hide after: [Never] 1h  15m  5m  Immediate

2 running · 1 done
● Subagent Research business licenses · Reading the city site          40% ▰▰▱▱▱▱  1:20
● Monitor  Wait for the dev server · curl localhost:3000                             4:02
✓ Subagent Draft the floor plan                                          0:56 (3m ago)
```

In each option row the choice in effect is drawn at full strength (shown as `[…]` above); the others are dim, and
pressing one picks it. They are the same compact buttons as the bar's.

Tasks run as Claude Code normally runs them: the pane only watches, adding no note to your prompts, changing no
model and putting nothing in the status line. Tracking costs no tokens: the lines are kept in memory for the session.

- A task's end is what Claude Code's own notice of it says (completed, failed, killed), whether the notice arrives
  as a prompt of its own or inside a running turn, the main chat's or the subagent's that started it. A subagent
  whose end was missed is settled when Claude next replies; a monitor whose closing notice never comes ends a minute
  past its deadline.
- Only while the pane is open, every subagent Claude starts with its Agent tool has its prompt ask it to report how
  far along it is through the mod's `agent_progress` tool (`mcp__aitools__agent_progress`); once it does, its line
  shows its percent (its own estimate) and a bar. Workflow agents, monitors, and subagents started while the
  pane was closed are not asked, so they show no bar.
- **Showing**: **All** (the default) lists every line; **Subagents**, **Workflows** and **Monitors** each list only
  that type. With nothing to list, the pane says what will appear there, e.g. `Monitors will appear here when
  started.`
- **Hide after**: how long a finished line stays: **Never** (the default), **1h**, **15m**, **5m** or
  **Immediate**. Either way the pane keeps at most the newest 50 finished lines.
- The Showing and Hide after picks are saved.
- A workflow's agents are told apart from the engine's own background forks (compaction, memory) only by whether a
  workflow has been started this session; after one, such a fork may briefly show as one of its agents.
- The pane itself starts closed in a new session.

## Branches

**Branches** in the **🛠** menu, or the project row's `5 branches`, opens the Branches pane; the pane's own close mark
closes it. `/branches` opens it,
or closes it if open. It stays open until you close it, and comes back after the mod reloads.

On the desktop, Clawd stands left of the pane's controls, snipping a stray branch off a tree. He sweeps with a broom
while branches are being removed, and naps under the tree, he and it in grey, when there is nothing to clean up. The
terminal has no picture.

```
Branches: [Local + remote]  Local  Remote
Show: [All]  Active  Done

6 branches · 2 worktrees · 3 done
Clean up removes 3 done branches: 1 worktree, 1 local and 2 remote branches.

Clean up 3 done  Refresh

  Branch                                       On     Checked out Last     Changes     PR CI
○ main · base                                  both   main folder   5m     -     -      - •
● feat/background-tasks · 3 changed            both   worktree     12m  +612   -48    #12 •  ×
↑ feat/totem-sizes · 2 unpushed                local  worktree      2d   +96  -210      - -  ×
✓ claude/repo-rename-watcher-setup-f7486b · …  local  worktree     11h     -     -      - -  ×
✓ feat/project-pane                            remote -            29h     -     -     #6 •  ×
✓ feat/project-row                             remote -             2d     -     -     #5 •  ×
```

The base branch is always the top row, then the branches with work to keep, then the done ones, each newest commit
first (the main folder's and this session's lead their group). One row is one branch, wherever it lives. A worktree is where a branch is checked out, so it shows on its branch's row
rather than as a row of its own. The desktop app checks its worktrees out detached, beside a branch named for the
folder (`claude/<folder>`); such a worktree joins that branch's row, and one no branch matches is a row of its own,
named by its folder.

- **Branches** filters by where a branch lives: **Local + remote** (the default), **Local** (a branch or worktree on
  your computer), **Remote** (a branch on the remote, `origin`).
- **Show** filters by how it stands: **All** (the default), **Active** (the base branch and anything with work to
  keep), **Done** (what Clean up would remove). Both picks are saved.
- The header counts the branches the Branches filter leaves, the worktrees among them, and the done ones. Under it, a
  line says what **Clean up** would do, or what the last removal did.

Each row:

- **The mark**: a blue ● the branch this session is on, a yellow ● uncommitted changes in its worktree, a yellow ↑
  commits not pushed, a dim ✓ done, ○ anything else.
- **The name**, then in dim grey what keeps it (`3 changed`, `2 unpushed`, `2 unmerged`), or `empty`, `base`, and
  what its worktree is (`detached`, `locked`, `folder missing`, `this session`), or `PR closed`. The name and these
  words take the room the pane's width leaves, cut with `…` at the edge. A done branch's row is dim throughout, its
  changes and CI included, as a finished background task's is.
- **On the right**, in columns that line up on every row under their titles: **On** (`both`, `local` or `remote`),
  **Checked out** (`main folder`, `worktree` or `-`), how long since its last commit, lines added and removed since it
  left the base branch (its worktree's uncommitted work included), its pull request (`#12`, which opens it on
  GitHub), CI, and ×.
- **CI**: a small dot, as GitHub shows it: green passed, red failed, yellow still running; `-` none found. It reads its
  pull request's checks at its commit, else the GitHub Actions runs at its commit.
- **×** asks on a line under the row what it takes, `Delete feat/x (worktree, local branch and remote branch)?`, with
  **Yes** and **No**, and what would be lost (`This loses 3 uncommitted files and 2 commits not on the base branch.`).
  Yes removes all of it. Pressing × again takes the question back. The base branch, the main folder's branch, this
  session's and a locked worktree's have no ×.

How a branch stands:

- **Done**: nothing uncommitted in its worktree, and every commit on it (local or remote) is on the base branch, or
  its pull request was merged at its current commit (a squash merge).
- **Empty**: its tip is one of the base branch's own commits, so it was branched off and never given commits of its
  own (a pull request merged at its commit makes it done instead). It shows `empty`, and Clean up removes it too.
- **Active**: anything else. **Base**: the base branch, origin's default branch (`origin/main`), else `origin/main` or
  `origin/master`, else a local `main` or `master`.

**Clean up N done** asks `Remove 1 worktree, 1 local and 2 remote branches?` with **Yes** and **No**, then removes
each done branch's worktree, local branch and remote branch, in that order, stopping at the first that fails. It never
forces: git itself refuses a worktree with changes. The rows are read again just before removing. Git never prompts:
a push that needs a password fails, and the pane says so.

The pane only reads git while it is open: when it opens, every 10 seconds, and a moment after a tool that can change
files (Bash, Edit, Write, a subagent). When it opens and every 5 minutes it also fetches from the remote (`git fetch
--prune`, so branches deleted on GitHub go) and reads GitHub (pull requests and CI, through the `gh` command, two API
calls). **Refresh**, right of **Clean up**, does all of that now. Without `gh`, or signed out, CI and pull requests show
`-` and the rest works. Closed, it reads nothing.

## Project row

In a GitHub repository a second row sits under the bar, for the project the session works in:

```
Vowelit  3 project items  5 branches  2 bg tasks  #42 Login fails…  ● Running feat/42-login  Stop Server  Docs
```

On the left:

- **The repository's name**, as GitHub has it, from the main checkout's GitHub remote (`origin` first),
  opening the repository in your browser. `name` in the project file shows a name of your own instead, as written.
- **`3 project items`**: how many items are open on the repository's GitHub Project board (as the
  [Project pane](#project-pane)'s Open filter counts them), while any is; it opens the Project pane, whose **Open in
  GitHub** opens the board. The board is the one linked to the repository, when exactly one is, looked up once a day
  through `gh`, which needs the `read:project` scope (`gh auth refresh -s read:project`); without it, name the board
  in the project file. Its items are read every 5 minutes while the row shows (see the Project pane).
- **`5 branches`**: how many branches the repository has besides the base branch (`main`), on your computer and on
  the remote, each counted once by name, while it has any; it opens the [Branches pane](#branches). It's read with
  one `git for-each-ref` every 30 seconds and shortly after a tool that can change files.
- **`2 bg tasks`**: how many [background tasks](#background-tasks) are running, while any is; it opens their pane.
- **The issue** the session is about: the first `#123` or `…/issues/123` in the session's first prompt (the context
  Claude Code adds to it is left out), else a number the branch is named for: `feat/123-login`, `123-fix`,
  `issue-123`, `gh-123` (a date like `2026-10-10-notes` is not). The prompt wins when both name one. Its title comes
  from GitHub, one call per issue, kept. It opens the issue in your browser.

Outside a GitHub repository there is no row. **Show project row** under the settings pane's Global Settings hides it
in every project (saved to the settings file), as `/aitools project on|off` does from the prompt; the one under
Project Settings hides it in this project only (saved to the project file).

### The project file

`<repo>/.claude/aitools.json` holds the row's settings and the tools on its right. Commit it to share the tools, or
gitignore it; it's yours either way. The mod writes it only when you change `enabled`, `name` or `board` in the
settings pane, and then only those keys, keeping the rest as it was (a file with no copy yet is made in the session's
checkout). A worktree reads its own copy, else the main checkout's. Changes take effect within 30 seconds, or at once
when Claude edits it.

```json
{
  "project": {
    "name": "Vowelit",
    "board": "https://github.com/users/pkkid/projects/1/views/2",
    "tools": [
      {
        "type": "server",
        "label": "Server",
        "start": ["{main}/tools/preview_worktree.sh", "{checkout}"],
        "stop": ["node", "--input-type=module", "-e",
                 "const {stopPreview} = await import(process.argv[1]); await stopPreview(process.argv[2])",
                 "{main}/backend/tools/stop-preview.mjs", "{checkout}"],
        "port": 8000,
        "ready": "Local preview ready: (\\S+)"
      },
      { "type": "command", "label": "Test", "run": "npm test" },
      { "type": "link", "label": "Docs", "url": "https://github.com/{repo}/wiki" }
    ]
  }
}
```

| Key | What it does |
|---|---|
| `enabled` | `false` hides the row in this project |
| `name` | The name shown on the left, in place of the repository's |
| `board` | The Project board's URL (a view of it works too), or `false` for none; left out, the linked board is looked up |
| `tools` | The tools on the right, in order |

Each tool has a `type`, a `label`, and optionally an `id` (made from the label when left out). Commands are a list of
arguments, run without a shell, or a string, run with `sh -c`, in the session's checkout unless `cwd` says otherwise.

- **`link`**: a button that opens `url`.
- **`command`**: a button that runs `run` and opens its log in a pane. A dot before it shows it running (yellow),
  passed (green) or failed (red); pressing it while it runs shows its log.
- **`server`**: a status that opens or closes its log, and a **Start**/**Stop** button. `start` runs as the mod's
  own process. `ready`, a regular expression, marks it running once its output matches (its first group, the URL, is
  kept); without one it counts as running as soon as it starts. `port` is read every 3 seconds, so a server started
  anywhere else (another session, an editor, a terminal) shows as running, with its checkout's branch. `stop` runs to
  stop it; without one, the mod ends its own process and whatever listens on the port. Reading the port uses `ss` and
  `/proc`, so Linux only. A server the mod started ends when Claude Code does.

Commands and links can name, in braces: `{checkout}` (this session's checkout), `{main}` (the main checkout),
`{branch}`, `{repo}` (`owner/name`), `{owner}`, `{name}`, `{issue}` (the row's issue number, or empty) and `{port}`.

Nothing in the file ever runs on its own: a command runs only when you press its button. The mod's own reads (git,
the port, GitHub's board and issue title) are the only automatic work. A tool the mod can't use is left out, with a
dim line in the chat saying why; the rest of the row still shows.

## Project pane

**Project** in the **🛠** menu, or the project row's `3 project items`, opens a pane listing the items on the
repository's GitHub Project board: open ones first, each Status column in the board's order, the most recently
changed first within a column:

```
Vowelit  Open in GitHub  3 items · updated 2m ago                                    [Clawd]
● Open 2  ○ Done 1  ○ All 3  Refresh

#181  Lobby: Show who is ready before the round starts      ● In Progress  PR #183
draft Idea: daily puzzle mode                               ○ Todo
```

- **Open in GitHub** opens the board. The note beside it counts the items and says how long since they were read.
- **Open**, **Done** and **All** filter the list. An item is done when its Status column is Done (or Closed,
  Complete…), or, with no Status, when its issue or pull request is closed.
- Each line has the item's number (opening it; `name#12` for another repository's, `draft` for a draft), its title,
  its Status and its pull request: the item itself when it is one, else the pull request that closes it (an open one
  first, then a merged one).
- Where SVG is drawn (the desktop), Clawd stacks task blocks top left; he sleeps by the finished tower when nothing is
  open, and scratches his head at a fallen one when there is no board to read.

The board is read with **one** GitHub API query (through `gh`, which needs the `read:project` scope). GitHub can only
list a board's items in board order, so the query filters instead: up to 100 items not in a done column, and up to 100
done ones changed in the last 30 days; the pane sorts them as above and keeps the first 100. The note beside **Open in
GitHub** says `95 of 140 items` when the board holds more than that.

It is read when the pane opens or the session starts with the project row showing, then every 5 minutes while either
holds. A read under 5 minutes old is kept and shared by every session, so opening the pane, a reload, or another chat
in the same project asks GitHub nothing. **Refresh** reads now and starts the 5 minutes over. With the pane closed and
the project row hidden, it reads nothing. With no board linked, name one as `project.board` in `.claude/aitools.json`.

## How thread cost % is estimated

The usage figures only report the weekly window as a percent, so the mod estimates what 1% of the week costs: this
machine's spend at API prices since the window opened (its reset time less 7 days) divided by the weekly percent used.
The thread's cost and the last turn's are then shown as shares of that, marked `~`. Usage on other machines or in
claude.ai's chat counts toward your weekly percent but not toward this machine's spend, which makes the shares read low;
the estimate also assumes the allowance is charged roughly in line with API prices. Hourly costs for the last 8 days are
kept alongside the monthly scan for this.

## How monthly cost is computed

The mod reads Claude Code's own transcripts (`~/.claude/projects/**/*.jsonl`, or under `CLAUDE_CONFIG_DIR`), counts
each assistant response once (by message id) when its timestamp falls in the current month, and prices its token usage
(input, output, cache writes at the 5-minute or 1-hour rate, cache reads) with the table in `src/pricing.ts` (API list
prices as of 2026-09-25). Only bytes added since the last scan are read; the cache lives in the mod's store and resets
each month. A `~` before a figure means part of it used an estimated rate (an unknown model priced by its family) or a
file could not be read.

## Limits

- Claude Code only: the Code tab in Claude Desktop and the terminal. Conversations in Claude Desktop's chat tab are not
  visible to mods and are not counted.
- Usage percentages come from the API's rate-limit headers, so they update after each response.
- Dollar figures are what the same tokens would cost on the API, not what the subscription costs.
