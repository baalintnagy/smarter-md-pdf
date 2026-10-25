// Original MD-PDF getting-started document.
// Historical StackEdit attribution is retained under public/licenses/.
export const SAMPLE = `# From a rough note to a finished page

A useful document starts with an idea. **MD-PDF** gives you a place to shape it,
check the layout, and turn it into a PDF you can share.

This file is a small practice space. Change a heading, add a row to the table, or
try another document style and watch the print preview respond.

## Find your writing rhythm

Use **Visual** mode to format text as you write. Switch to **Markdown** when you
want to work directly with headings, links, lists, and code fences.

A little formatting goes a long way: **bold** draws attention, *italics* add
emphasis, and ~~crossed-out text~~ records an idea you have moved past.
Use inline code such as \`meeting-notes.md\` for filenames and short commands.
Add a link when readers need a reference, such as the
[MD-PDF project](https://github.com/baalintnagy/smarter-md-pdf).

> Give each section one job. A clear heading and a few precise sentences are
> often enough to help the next reader find their way.

### A quick checklist

- [x] Give the document a clear title.
- [x] Group related ideas under headings.
- [ ] Replace this example with something of your own.
- [ ] Check the preview before printing.

### A short plan

1. Capture the main point while it is fresh.
2. Add the details that support it.
3. Read the result as someone seeing it for the first time.

## Keep the details together

Tables work well for compact comparisons. In Visual mode, use **Table** to insert
one, then click a cell to find row, column, and alignment controls.

| Stage | What to do | Ready when |
| :--- | :--- | :--- |
| Draft | Collect the facts | The main idea is clear |
| Edit | Tighten the wording | Every section earns its place |
| Share | Review the PDF | The pages are easy to read |

Code fences preserve spacing and add syntax highlighting for supported languages:

\`\`\`javascript
const sections = ['Draft', 'Edit', 'Share'];
const checklist = sections.map((section) => ({
    title: section,
    complete: false,
}));
\`\`\`

## Write formulas with KaTeX

Write LaTeX-style math in Markdown mode; KaTeX typesets it in the print preview.
Use single dollar signs for inline expressions and double dollar signs on their
own lines for display equations. Inline code keeps syntax literal: \`$x^2$\`.

For example, a simple completion rate is $r = \\frac{d}{n}$, where $d$ is the number
of finished tasks and $n > 0$ is the total. As a display equation:

$$
\\text{progress} = \\frac{\\text{finished tasks}}{\\text{total tasks}} \\times 100\\%
$$

### Roots of a quadratic

For $ax^2 + bx + c = 0$ with $a \\ne 0$, the quadratic formula is:

$$
x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}
$$

### Aligned equations and sums

For $n > 0$ observations, their mean and population variance can be written together:

$$
\\begin{aligned}
\\mu &= \\frac{1}{n} \\sum_{i=1}^{n} x_i \\\\
\\sigma^2 &= \\frac{1}{n} \\sum_{i=1}^{n} (x_i - \\mu)^2
\\end{aligned}
$$

### Matrices

A two-dimensional rotation uses a matrix and a column vector:

$$
\\begin{bmatrix} x' \\\\ y' \\end{bmatrix}
= \\begin{bmatrix}
\\cos \\theta & -\\sin \\theta \\\\
\\sin \\theta & \\cos \\theta
\\end{bmatrix}
\\begin{bmatrix} x \\\\ y \\end{bmatrix}
$$

### Piecewise functions

Use a cases environment to show a rule with different branches:

$$
|x| = \\begin{cases}
x & \\text{if } x \\ge 0, \\\\
-x & \\text{if } x < 0.
\\end{cases}
$$

## Try AsciiMath for simpler input

AsciiMath offers a compact alternative to LaTeX. Wrap inline expressions in
\`@{…}\`: the length of a right triangle's hypotenuse is @{sqrt(x^2 + y^2)}.
Fractions can be written directly as @{(a + b)/(c + d)}.

For a display equation, use a fenced block labeled \`asciimath\`:

\`\`\`asciimath
x = (-b +- sqrt(b^2 - 4 a c)) / (2 a)
\`\`\`

Subscripts, superscripts, sums, and Greek letters work too:

\`\`\`asciimath
sum_(n=1)^oo 1/n^2 = pi^2/6
\`\`\`

AsciiMath is converted to LaTeX and typeset with KaTeX in the print preview.
Keep ordinary code in backticks, such as \`@{sqrt(x)}\`, to show the source literally.

## Explain a process with Mermaid

In Markdown mode, put diagram source inside a fenced code block labeled
\`mermaid\`. The print preview draws the diagram; the editor keeps its source editable.

### Flowchart: make a decision

Shapes and labeled branches help explain a review workflow:

\`\`\`mermaid
flowchart LR
    A([Start]) --> B[Write a draft]
    B --> C{Ready to share?}
    C -->|Needs changes| B
    C -->|Approved| D[Save a PDF]
    D --> E([Done])
\`\`\`

### Sequence diagram: follow a conversation

Participants exchange messages in order. An alternative block shows two outcomes:

\`\`\`mermaid
sequenceDiagram
    participant Writer
    participant Reviewer
    Writer->>Reviewer: Send the draft
    Note over Writer,Reviewer: Check the content and page layout
    alt Changes needed
        Reviewer-->>Writer: Return comments
        Writer->>Reviewer: Send the revised draft
    else Ready to share
        Reviewer-->>Writer: Approve the document
    end
\`\`\`

<div class="page-break"></div>

### State diagram: track a document

States describe where a document is now and which transitions are possible:

\`\`\`mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> InReview: Submit
    InReview --> Draft: Request changes
    InReview --> Approved: Accept
    Approved --> Archived: Store a copy
    Archived --> [*]
\`\`\`

### Class diagram: describe a small model

Show the relationship between a folder and the documents it contains:

\`\`\`mermaid
classDiagram
    class Folder {
        +String name
        +addDocument()
    }
    class Document {
        +String title
        +String markdown
        +exportPDF()
    }
    Folder "1" o-- "0..*" Document : contains
\`\`\`

## Bring in an image

In Visual mode, paste or drop a raster image, or use the image control. Imported
images are kept in the browser library or your selected disk folder. For an existing Markdown file,
open its matching image files too so relative image references can be resolved.
SVG uploads are not supported.

## Make the page your own

Choose a **Document style** for a starting point, then edit the CSS to adjust
fonts, colors, spacing, and borders. **Import CSS** loads a stylesheet from disk.
The interface theme and the printed document style are independent.

Set the paper size, orientation, and margins before your final review. Smart
pagination tries to keep headings with their content and split longer tables
into readable groups, repeating table headers across pages. Use **Page break**
when a section should start on a new page.

The automatic scale range limits fitting reductions to preserve readability.
Edit the limits to use a custom range. If a diagram, image, or other indivisible
block still cannot fit, adjust its size, the CSS, or the paper settings; the app
reports the overflow and disables its print button until the layout fits.

## Keep your work and share a copy

Open the document library to create documents and nested folders. Select an item
to rename, duplicate, move, or delete it. Deleting a folder also removes its
contents after confirmation; there is no trash folder for recovery.

Edits, document CSS, paper settings, and imported images save locally in this
browser's IndexedDB database by default. **Save** or
**Ctrl/Cmd+S** also saves explicitly. Clearing site data removes the local library,
so export important work regularly.

On desktop Chrome or Edge, **Open local folder…** lets you keep documents on disk.
Grant folder access to save Markdown files directly there. **Copy library to empty
folder…** copies your browser library and images; **Use browser library** returns to
the original browser copy. Keep the folder's companion file, \`.md-pdf.json\`,
with your documents to preserve styles and paper settings.

The browser may ask you to **Reconnect folder** in a later session. If a file changes
outside the app, saving stops so you can export your unsaved Markdown and **Reload
folder from disk**. Deleting library items in folder mode removes their disk copies;
unrelated files and images are preserved.

- **Open files** imports Markdown or text files. Include matching raster images
  when your Markdown refers to local image filenames.
- **Export Markdown** downloads the source text. It does not bundle styles or images.
- **Print / Save PDF** opens the browser print dialog. Choose the matching paper
  size, use 100% scale, and turn off browser headers and footers.

Files brought in through **Open files** are imported copies. In browser storage,
editing them does not update the originals; folder mode saves them in the selected folder.
There is no account, cloud synchronization, or publishing service. The library is
specific to this browser and site; disk folders can be reopened wherever you have access.
Remote images or resources referenced by your CSS can still make network requests.

---

Ready for a fresh page? Create a document in the library, or select this text and
start writing. Your next report, handout, or set of notes can begin right here.
`;
