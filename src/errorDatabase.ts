export interface ErrorRule {
  id: string;
  category: 'npm' | 'node' | 'python' | 'git' | 'general';
  pattern: RegExp;
  whatHappened: string;
  why: string;
  fix: string[];
  learnMoreUrl?: string;
  /**
   * Optional: when present, called with the raw matched text to produce
   * fix steps tailored to specifics (e.g. which exact tool is missing),
   * instead of using the static `fix` array above.
   */
  dynamicFix?: (rawText: string) => string[];
}

const KNOWN_TOOLS: Record<string, { name: string; installSteps: string[] }> = {
  python: {
    name: 'Python',
    installSteps: [
      'Download and install Python from https://python.org/downloads',
      'During install on Windows, check the box "Add python.exe to PATH" — this is the most commonly missed step',
      'Restart your terminal after installing, then verify with: python --version'
    ]
  },
  python3: {
    name: 'Python',
    installSteps: [
      'Download and install Python from https://python.org/downloads',
      'On Mac, you can also install it with: brew install python3',
      'Restart your terminal after installing, then verify with: python3 --version'
    ]
  },
  node: {
    name: 'Node.js',
    installSteps: [
      'Download and install Node.js (LTS version) from https://nodejs.org',
      'Restart your terminal after installing, then verify with: node --version',
      'Consider using a version manager like nvm if you\'ll need multiple Node versions later'
    ]
  },
  npm: {
    name: 'npm',
    installSteps: [
      'npm is installed automatically with Node.js — install Node.js from https://nodejs.org',
      'If Node is already installed but npm isn\'t found, try reinstalling Node.js',
      'Restart your terminal after installing, then verify with: npm --version'
    ]
  },
  git: {
    name: 'Git',
    installSteps: [
      'Download and install Git from https://git-scm.com/downloads',
      'On Mac, you can also install it with: brew install git or by installing Xcode Command Line Tools',
      'Restart your terminal after installing, then verify with: git --version'
    ]
  },
  java: {
    name: 'Java',
    installSteps: [
      'Download and install a JDK, e.g. from https://adoptium.net (a good free, well-maintained option)',
      'Restart your terminal after installing, then verify with: java -version',
      'Make sure JAVA_HOME is set if other tools rely on it'
    ]
  },
  javac: {
    name: 'the Java compiler (javac)',
    installSteps: [
      'You likely have a JRE but not a full JDK — download a JDK from https://adoptium.net',
      'Restart your terminal after installing, then verify with: javac -version'
    ]
  },
  ruby: {
    name: 'Ruby',
    installSteps: [
      'On Mac: brew install ruby   |   On Windows: use https://rubyinstaller.org   |   On Linux: use your package manager, e.g. sudo apt install ruby',
      'Restart your terminal after installing, then verify with: ruby --version'
    ]
  },
  gem: {
    name: 'RubyGems (gem)',
    installSteps: [
      'gem is installed automatically with Ruby — install Ruby first (see ruby above)',
      'Verify with: gem --version'
    ]
  },
  php: {
    name: 'PHP',
    installSteps: [
      'On Mac: brew install php   |   On Windows: download from https://windows.php.net/download   |   On Linux: sudo apt install php',
      'Restart your terminal after installing, then verify with: php --version'
    ]
  },
  composer: {
    name: 'Composer (PHP package manager)',
    installSteps: [
      'Install PHP first (see php above), then install Composer from https://getcomposer.org/download',
      'Verify with: composer --version'
    ]
  },
  go: {
    name: 'Go',
    installSteps: [
      'Download and install Go from https://go.dev/dl',
      'Restart your terminal after installing, then verify with: go version'
    ]
  },
  rustc: {
    name: 'Rust',
    installSteps: [
      'Install Rust using rustup: https://rustup.rs (run the install script/command shown there)',
      'Restart your terminal after installing, then verify with: rustc --version'
    ]
  },
  cargo: {
    name: 'Cargo (Rust\'s package manager)',
    installSteps: [
      'Cargo comes bundled with Rust — install via rustup: https://rustup.rs',
      'Verify with: cargo --version'
    ]
  },
  dotnet: {
    name: '.NET',
    installSteps: [
      'Download and install the .NET SDK from https://dotnet.microsoft.com/download',
      'Restart your terminal after installing, then verify with: dotnet --version'
    ]
  },
  code: {
    name: 'the VS Code command-line launcher',
    installSteps: [
      'Open VS Code, then Command Palette (Ctrl+Shift+P) → run "Shell Command: Install \'code\' command in PATH"',
      'Restart your terminal afterward, then verify with: code --version'
    ]
  }
};

function extractMissingCommand(text: string): string | null {
  const cmdExeMatch = text.match(/'([^']+)' is not recognized as an internal or external command/i);
  if (cmdExeMatch) {
    return cmdExeMatch[1].trim().toLowerCase();
  }

  const powershellMatch = text.match(/(?:The term )?'([^']+)' is not recognized as the name of a cmdlet/i);
  if (powershellMatch) {
    return powershellMatch[1].trim().toLowerCase();
  }

  const unixMatch = text.match(/(\S+):\s*command not found/i);
  if (unixMatch) {
    return unixMatch[1].trim().toLowerCase();
  }

  return null;
}

function commandNotFoundFix(rawText: string): string[] {
  const cmd = extractMissingCommand(rawText);
  const known = cmd ? KNOWN_TOOLS[cmd] : undefined;

  if (known) {
    return [
      `It looks like ${known.name} specifically isn't installed (or isn't on your PATH):`,
      ...known.installSteps
    ];
  }

  return [
    'Double check for typos in the command name',
    'Confirm the tool is installed by checking its version, e.g. <tool-name> --version or <tool-name> -v',
    "If it's installed but still not found, its install location likely isn't in your PATH — reinstalling or restarting your terminal often fixes this"
  ];
}


// Ordering matters: more specific patterns should come before generic ones,
// since the matcher returns the first match.
export const errorRules: ErrorRule[] = [
  // ---------- Node / npm ----------
  {
    id: 'npm-module-not-found',
    category: 'npm',
    pattern: /Cannot find module '([^']+)'/i,
    whatHappened: "Your code tried to use a package that isn't installed.",
    why: "Node looks for packages inside a node_modules folder. It's either never been installed, got deleted, or your install step failed silently.",
    fix: [
      'Run: npm install <package-name>  (use the missing package name shown in the error)',
      "If you're not sure which one is missing, run: npm install (re-installs everything from package.json)",
      'Delete node_modules and package-lock.json, then run npm install again if the problem persists'
    ],
    learnMoreUrl: 'https://nodejs.org/api/modules.html#loading-from-node_modules-folders'
  },
  {
    id: 'npm-eresolve',
    category: 'npm',
    pattern: /ERESOLVE/i,
    whatHappened: 'npm found two packages that need conflicting versions of the same dependency.',
    why: "This happens when one package you installed needs, say, React 17 and another needs React 18, and npm can't automatically pick one.",
    fix: [
      'Run: npm install --legacy-peer-deps  (tells npm to ignore the conflict, usually safe)',
      'Or run: npm install --force  (more aggressive, use if legacy-peer-deps fails)',
      'Long-term: check which package is outdated and update it with npm update <package-name>'
    ]
  },
  {
    id: 'npm-eaddrinuse',
    category: 'node',
    pattern: /EADDRINUSE/i,
    whatHappened: 'Another program is already using the port your app is trying to start on.',
    why: 'Only one program can listen on a given network port at a time. Usually this means a previous run of your app is still running in the background.',
    fix: [
      'Find and stop the other process: on Mac/Linux run lsof -i :<port> then kill -9 <PID>; on Windows run netstat -ano | findstr :<port> then taskkill /PID <PID> /F',
      'Or simply change the port your app uses (e.g. in a .env file or config)'
    ]
  },
  {
    id: 'npm-eacces',
    category: 'general',
    pattern: /EACCES/i,
    whatHappened: "Your command was blocked because you don't have permission to access a file or folder.",
    why: 'This usually happens with global npm installs, or when a folder is owned by a different user (often root, if you used sudo before).',
    fix: [
      'Avoid sudo with npm — instead fix ownership: sudo chown -R $(whoami) ~/.npm',
      'For project folders, check ownership with ls -la and fix with chown if needed',
      "On Windows, try running your terminal as Administrator (as a last resort, not a habit)"
    ]
  },
  {
    id: 'npm-enoent',
    category: 'general',
    pattern: /ENOENT.*no such file or directory/i,
    whatHappened: 'Your command tried to open or read a file/folder that doesn\'t exist at that path.',
    why: "This is often a typo in a file path, running a command from the wrong folder, or a build step that never actually created the file.",
    fix: [
      'Double check the path in the error message for typos',
      'Make sure you\'re running the command from the project root (pwd to check, ls to see what\'s actually there)',
      'If it references a build output file, try running your build command first'
    ]
  },
  {
    id: 'node-undefined-not-function',
    category: 'node',
    pattern: /is not a function/i,
    whatHappened: "Your code tried to call something as a function, but it isn't one (it's undefined, a string, an object, etc).",
    why: 'This usually means a typo in a method name, an import that didn\'t work as expected, or a variable that isn\'t what you think it is at that point in the code.',
    fix: [
      'Check the exact line/column in the error for the variable name being called',
      'Add a console.log(typeof yourVariable) right before that line to see what it actually is',
      "Double check you're importing/exporting that function correctly (default vs named export is a common culprit)"
    ]
  },
  {
    id: 'node-cannot-read-undefined',
    category: 'node',
    pattern: /Cannot read propert(y|ies) '?[\w]*'? of (undefined|null)/i,
    whatHappened: "Your code tried to access a property on something that doesn't exist yet (it's undefined or null).",
    why: 'A common cause: data hasn\'t loaded yet (like an API response), or a variable was never assigned before you tried to use it.',
    fix: [
      'Check the line number in the error and see which variable is undefined/null',
      'Add a safety check before using it, e.g. if (myVar) { ... } or myVar?.property (optional chaining)',
      'If it\'s data from an API/database, make sure you\'re waiting for it (await/.then) before using it'
    ]
  },
  {
    id: 'node-unexpected-token',
    category: 'node',
    pattern: /SyntaxError: Unexpected token/i,
    whatHappened: 'Your code has invalid JavaScript/TypeScript syntax — the parser hit something it didn\'t expect.',
    why: 'Often a missing bracket, comma, or quote, or you\'re using syntax (like top-level await, or newer JS features) that your current setup doesn\'t support.',
    fix: [
      'Check the exact line and column shown in the error for a missing/extra bracket, brace, or comma',
      "If it's near the top of the file, check your import/export statements",
      'If this is new JS syntax, check your Node version (node -v) or your bundler/babel config supports it'
    ]
  },
  {
    id: 'ts-type-error',
    category: 'node',
    pattern: /error TS\d+:/,
    whatHappened: "TypeScript's type checker found a mismatch between what your code expects and what it's actually getting.",
    why: 'TypeScript is telling you, before you even run the code, that a value doesn\'t match the type you declared (e.g. passing a string where a number is expected).',
    fix: [
      'Read the specific TS error code and message — it names the exact mismatch (e.g. "Type string is not assignable to type number")',
      'Fix the value being passed, or update the type/interface if the type declaration itself is wrong',
      'If you\'re prototyping and want to bypass temporarily, you can cast with "as any" — but treat this as a temporary patch, not a fix'
    ]
  },
  {
    id: 'node-import-unquoted-path',
    category: 'node',
    pattern: /SyntaxError: Unexpected identifier '([^']+)'/,
    whatHappened: "Your import statement has a module name that isn't wrapped in quotes.",
    why: "JavaScript treats module names as text (strings), so they need quotes. Writing import parser from lodash (no quotes) makes JS think lodash is a variable name, which breaks the syntax.",
    fix: [
      "Add quotes around the module name, e.g.: import parser from 'lodash'",
      'Do the same for any other unquoted import paths in the file',
      "Check the exact line/column shown in the error — that's where the missing quotes are"
    ]
  },
  {
    id: 'node-esm-export-mismatch',
    category: 'node',
    pattern: /does not provide an export named '([^']+)'/,
    whatHappened: "You tried to import something by a name that doesn't actually exist in that module.",
    why: "This is usually a typo in the name inside the curly braces, or the package doesn't export what you think it does (maybe it only has a default export, or a differently-named one).",
    fix: [
      "Double-check the exact spelling/casing of the name inside { } against the package's documentation",
      "If you're not sure what's exported, try: import * as everything from 'module-name' then console.log(everything) to see all available exports",
      'Check whether you actually want a default import instead: import thing from \'module-name\' (no curly braces) rather than a named one'
    ]
  },
  {
    id: 'node-esm-module-not-found',
    category: 'node',
    pattern: /Cannot find package '([^']+)' imported from/,
    whatHappened: "Your code tried to import a package that isn't installed.",
    why: 'Same root cause as a regular "Cannot find module" error, just phrased differently because this file uses modern ES module import syntax instead of require().',
    fix: [
      'Run: npm install <package-name>  (use the missing package name shown in the error)',
      'If you\'re sure it\'s installed, double check for a typo in the import path',
      'Run npm install with no arguments to make sure everything in package.json is actually installed'
    ]
  },
  {
    id: 'node-import-outside-module',
    category: 'node',
    pattern: /Cannot use import statement outside a module/,
    whatHappened: "Node tried to run your file as a regular script, but it contains modern import syntax that only works in ES modules.",
    why: 'By default, Node treats .js files as CommonJS (using require()). The import/export syntax needs Node to know the file is an ES module.',
    fix: [
      'Add "type": "module" to your package.json, OR',
      'Rename the file to use a .mjs extension instead of .js, OR',
      "If you're intentionally using CommonJS, switch to require('module-name') instead of import ... from"
    ]
  },
  {
    id: 'node-mixed-import-require',
    category: 'node',
    pattern: /require\(\) of ES Module|exports is not defined in ES module scope/,
    whatHappened: "Your code mixed the two module systems (CommonJS's require and ES module's import/export) in a way Node can't reconcile.",
    why: 'A package or file was set up as an ES module, but something tried to load it the old CommonJS way (or vice versa).',
    fix: [
      'If you\'re requiring a package that only supports ESM, switch your require(\'pkg\') to a dynamic import: const pkg = await import(\'pkg\')',
      'Check the package\'s docs — some newer packages dropped CommonJS support entirely and require ESM'
    ]
  },


  {
    id: 'npm-peer-dep-missing',
    category: 'npm',
    pattern: /npm ERR!.*peer dep missing/i,
    whatHappened: 'A package you installed expects another package to also be installed, but it isn\'t.',
    why: 'Some packages (like React component libraries) rely on you separately installing things like react and react-dom.',
    fix: [
      'Look at the warning for the exact peer dependency name and version needed',
      'Run: npm install <peer-package-name>'
    ]
  },

  // ---------- Python ----------
  {
    id: 'python-modulenotfound',
    category: 'python',
    pattern: /ModuleNotFoundError: No module named '([^']+)'/i,
    whatHappened: "Python tried to import a package that isn't installed in this environment.",
    why: 'Python looks for packages in your current environment (system Python or a virtual environment). It\'s either not installed, or you\'re running a different Python environment than you installed it in.',
    fix: [
      'Run: pip install <package-name>  (use the module name shown in the error)',
      'If you use virtual environments, make sure it\'s activated first (source venv/bin/activate on Mac/Linux, venv\\Scripts\\activate on Windows)',
      'Check you\'re using the right pip/python: which python and which pip should point to the same environment'
    ]
  },
  {
    id: 'python-indentationerror',
    category: 'python',
    pattern: /IndentationError/i,
    whatHappened: "Python's spacing rules were broken — a line isn't indented the way Python expects.",
    why: 'Python uses indentation (spaces/tabs) to know which code belongs inside a function, loop, or if-statement. Mixing tabs and spaces, or a stray space, breaks this.',
    fix: [
      'Go to the line number shown in the error and check its indentation matches the lines around it',
      'Make sure your editor is set to use spaces consistently (VS Code: check the indentation indicator in the bottom status bar)',
      'In VS Code, you can run "Convert Indentation to Spaces" from the Command Palette to fix a whole file at once'
    ]
  },
  {
    id: 'python-nameerror',
    category: 'python',
    pattern: /NameError: name '([^']+)' is not defined/i,
    whatHappened: "Your code used a variable or function name that Python has never seen before.",
    why: 'Usually a typo, using a variable before it\'s created, or forgetting to import something.',
    fix: [
      'Check for typos in the name shown in the error',
      "Make sure the variable is defined before the line where it's used",
      'If it\'s a function from a library, check you imported it (import ... at the top of the file)'
    ]
  },
  {
    id: 'python-typeerror',
    category: 'python',
    pattern: /TypeError: /i,
    whatHappened: 'Your code tried to use a value in a way that doesn\'t match its type (e.g. adding text and a number together).',
    why: 'Python is strict about mixing types in certain operations — this error is Python telling you exactly which operation failed and why.',
    fix: [
      'Read the rest of the TypeError message — it usually names the exact operation and types involved',
      'Add a print(type(your_variable)) before the failing line to confirm what it actually is',
      'Convert types explicitly if needed, e.g. str(number) or int(text)'
    ]
  },
  {
    id: 'python-indexerror',
    category: 'python',
    pattern: /IndexError: list index out of range/i,
    whatHappened: 'Your code tried to access a position in a list that doesn\'t exist.',
    why: 'This usually happens when a list is shorter than you expect, often because a loop ran too many times or the list was empty.',
    fix: [
      'Check the length of the list before accessing an index: print(len(your_list))',
      'Add a bounds check, e.g. if index < len(your_list):',
      'If looping, double check your range() bounds'
    ]
  },
  {
    id: 'python-keyerror',
    category: 'python',
    pattern: /KeyError: /i,
    whatHappened: "Your code tried to access a dictionary key that doesn't exist.",
    why: 'This often happens with data from an API or file where you assumed a field exists, but it\'s missing or named differently.',
    fix: [
      'Use your_dict.get("key") instead of your_dict["key"] — it returns None instead of crashing if missing',
      'Print your_dict.keys() to see what keys actually exist',
      'Check for typos in the key name shown in the error'
    ]
  },
  {
    id: 'python-syntaxerror',
    category: 'python',
    pattern: /SyntaxError: /i,
    whatHappened: 'Python found something that breaks its grammar rules — invalid syntax.',
    why: 'Often a missing colon after if/for/def, a mismatched bracket/quote, or leftover code from a different language.',
    fix: [
      'Check the exact line shown in the error (Python usually points to it precisely)',
      'Look for a missing colon (:), unclosed bracket/quote, or an extra/missing comma',
      'If it\'s at the end of a file, check nothing important got accidentally deleted'
    ]
  },
  {
    id: 'pip-not-recognized',
    category: 'python',
    pattern: /'pip' is not recognized|pip: command not found/i,
    whatHappened: "Your terminal doesn't know what 'pip' means.",
    why: 'Python (and pip) isn\'t installed, or it isn\'t added to your system\'s PATH so the terminal can find it.',
    fix: [
      'Try python -m pip instead of pip directly (works even when PATH isn\'t set up)',
      'On Windows, try py -m pip instead',
      'If Python truly isn\'t installed, download it from python.org and make sure to check "Add to PATH" during install'
    ]
  },

  {
    id: 'python-attributeerror',
    category: 'python',
    pattern: /AttributeError: '([^']+)' object has no attribute '([^']+)'/i,
    whatHappened: "Your code tried to use a property or method that doesn't exist on that object.",
    why: "Usually a typo in the method/attribute name, or you're expecting an object of one type but actually have a different type (e.g. expecting a list but got None).",
    fix: [
      'Check the exact spelling shown in the error — Python often suggests the closest matching name ("Did you mean...")',
      'Add a print(type(your_variable)) before the failing line to confirm what type it actually is',
      "If it's from an API/database, the value you expected might be missing/None instead of the object you assumed"
    ]
  },
  {
    id: 'python-zerodivision',
    category: 'python',
    pattern: /ZeroDivisionError/i,
    whatHappened: 'Your code tried to divide a number by zero, which is undefined and not allowed.',
    why: "This usually happens when a divisor variable turns out to be 0 — often from unvalidated user input, an empty list's length, or a calculation that unexpectedly resulted in zero.",
    fix: [
      'Add a check before dividing: if divisor != 0: ... else: handle it another way',
      'Trace back where the divisor value comes from to see why it ended up as zero'
    ]
  },
  {
    id: 'python-recursionerror',
    category: 'python',
    pattern: /RecursionError: maximum recursion depth exceeded/i,
    whatHappened: 'A function kept calling itself over and over without stopping, until Python gave up.',
    why: 'This usually means a recursive function is missing its "base case" (the condition that should stop it from calling itself again), or the base case is never actually reached.',
    fix: [
      'Check that your recursive function has a clear stopping condition, and that it\'s reachable',
      'Add a print statement at the top of the function to see what values it\'s being called with, to spot why it never stops',
      'For deep-but-intentional recursion, consider rewriting as a loop instead'
    ]
  },


  {
    id: 'git-not-a-repo',
    category: 'git',
    pattern: /not a git repository/i,
    whatHappened: "Git commands don't work here because this folder isn't set up as a Git project yet.",
    why: 'Git needs a hidden .git folder to track anything. It\'s either missing, or you\'re running the command from the wrong folder.',
    fix: [
      'If this should be a new project: run git init',
      "If you meant to clone an existing project, make sure you're in the right folder (pwd, then cd into the correct one)"
    ]
  },
  {
    id: 'git-merge-conflict',
    category: 'git',
    pattern: /CONFLICT \(content\)|Automatic merge failed/i,
    whatHappened: 'Git tried to combine two sets of changes automatically, but the same lines were changed differently in each — it needs you to decide which to keep.',
    why: 'This isn\'t a bug — it\'s Git being careful. It won\'t guess which version of conflicting code is correct.',
    fix: [
      'Run git status to see which files have conflicts',
      'Open each conflicted file — look for <<<<<<<, =======, >>>>>>> markers showing both versions',
      'Edit the file to keep the correct code and remove the markers, then run: git add <file> and git commit'
    ]
  },
  {
    id: 'git-rejected-non-fast-forward',
    category: 'git',
    pattern: /\[rejected\].*non-fast-forward|Updates were rejected/i,
    whatHappened: 'Git refused to push your changes because the remote branch has commits you don\'t have locally.',
    why: 'Someone else (or another device of yours) pushed changes after your last pull. Git won\'t overwrite their work silently.',
    fix: [
      'Run: git pull  (this merges the remote changes into yours — resolve any conflicts if prompted)',
      'Then run: git push',
      "Avoid git push --force unless you're certain you want to overwrite the remote history"
    ]
  },
  {
    id: 'git-detached-head',
    category: 'git',
    pattern: /detached HEAD/i,
    whatHappened: "You're looking at an old commit instead of a branch, so new commits here won't belong to any branch by default.",
    why: 'This happens after checking out a specific commit hash or tag directly instead of a branch name.',
    fix: [
      'If you want to keep any changes made here, create a new branch first: git checkout -b my-new-branch',
      'To go back to your normal branch: git checkout main  (or whichever branch you were on)'
    ]
  },
  {
    id: 'git-permission-denied-publickey',
    category: 'git',
    pattern: /Permission denied \(publickey\)/i,
    whatHappened: "Git couldn't authenticate you with the remote server (like GitHub) over SSH.",
    why: 'Your SSH key either isn\'t set up, isn\'t added to your GitHub/GitLab account, or the SSH agent isn\'t running.',
    fix: [
      'Test your connection: ssh -T git@github.com',
      "If you don't have an SSH key yet, generate one: ssh-keygen -t ed25519 -C \"your_email@example.com\"",
      'Add the public key (~/.ssh/id_ed25519.pub) to your GitHub account under Settings > SSH Keys'
    ]
  },
  {
    id: 'git-nothing-to-commit',
    category: 'git',
    pattern: /nothing to commit, working tree clean/i,
    whatHappened: "Git says there's nothing new to save — your files exactly match your last commit.",
    why: "This isn't really an error — it's Git confirming there are no changes to commit right now.",
    fix: [
      'If you expected changes, make sure you saved your file in the editor first',
      "Run git status to double check what Git currently sees"
    ]
  },

  // ---------- Web / bundlers / frameworks ----------
  {
    id: 'webpack-module-not-resolve',
    category: 'node',
    pattern: /Module not found: Error: Can't resolve '([^']+)'/i,
    whatHappened: "Your build tool (webpack/similar) couldn't find a file or package you tried to import.",
    why: "Either the package isn't installed, or the import path/filename has a typo (including wrong case — this matters even on Windows/Mac if you deploy to Linux).",
    fix: [
      "If it's a package name: run npm install <package-name>",
      "If it's a relative path (like './components/Button'): check the file exists at that exact path and the casing matches exactly",
      'Restart your dev server after installing new packages — it sometimes doesn\'t pick them up live'
    ]
  },
  {
    id: 'vite-failed-to-resolve-import',
    category: 'node',
    pattern: /Failed to resolve import "([^"]+)"/i,
    whatHappened: "Vite couldn't find a file or package you tried to import.",
    why: "Either the package isn't installed, or the import path has a typo or wrong file extension.",
    fix: [
      "If it's a package: run npm install <package-name>",
      'Double check the exact path and filename, including case sensitivity',
      'Restart the Vite dev server after installing new dependencies'
    ]
  },
  {
    id: 'react-invalid-child',
    category: 'node',
    pattern: /Objects are not valid as a React child/i,
    whatHappened: "Your React component tried to directly render a plain object (or array of objects) instead of text, numbers, or JSX elements.",
    why: 'A common cause: rendering {someObject} directly in JSX instead of a specific property like {someObject.name}, or forgetting to .map() over an array to turn it into elements.',
    fix: [
      'Find the {} expression in your JSX that\'s rendering the raw object',
      'Render a specific field instead, e.g. {user.name} instead of {user}',
      'If it\'s an array of items, make sure you\'re using .map() to turn each one into a JSX element, not rendering the array directly'
    ]
  },
  {
    id: 'react-hydration-mismatch',
    category: 'node',
    pattern: /Hydration failed because|Text content does not match server-rendered HTML/i,
    whatHappened: "The page your server sent didn't exactly match what React tried to render in the browser, so React had to redo it.",
    why: 'Common causes: using values that differ between server and browser (like Date.now(), Math.random(), or checking window/localStorage) directly in your component\'s render output.',
    fix: [
      'Move any browser-only or time/random-based values into a useEffect so they only run after the page loads in the browser',
      'If you need a value only in the browser, initialize it as null/undefined first, then set it after mount',
      'Check for browser extensions modifying your HTML too — this can also trigger false hydration mismatches in dev'
    ]
  },
  {
    id: 'cors-blocked',
    category: 'general',
    pattern: /has been blocked by CORS policy|No 'Access-Control-Allow-Origin' header/i,
    whatHappened: "Your browser blocked a request to another server because that server didn't explicitly allow it.",
    why: "This is a browser security feature (CORS), not a bug in your network. The server you're calling needs to explicitly say it's okay for your site's origin to access it.",
    fix: [
      "If you control the server, add the appropriate Access-Control-Allow-Origin header (or use a CORS middleware library for your backend framework)",
      "If you don't control the server, you may need a backend proxy that makes the request server-side instead of directly from the browser",
      "For local development only, some tools let you temporarily disable CORS checks in the browser — don't rely on this in production"
    ]
  },

  // ---------- Docker / containers ----------
  {
    id: 'docker-daemon-not-running',
    category: 'general',
    pattern: /Cannot connect to the Docker daemon/i,
    whatHappened: "Docker commands can't run because Docker itself isn't running.",
    why: 'The Docker CLI is just a client — it needs Docker Desktop (or the Docker daemon/service) to actually be running in the background.',
    fix: [
      'Start Docker Desktop (or on Linux: sudo systemctl start docker)',
      "Wait for it to fully finish starting (Docker Desktop's whale icon usually shows a loading state) before running commands again",
      'Verify it\'s running with: docker ps'
    ]
  },
  {
    id: 'docker-port-in-use',
    category: 'general',
    pattern: /Bind for 0\.0\.0\.0:\d+ failed: port is already allocated/i,
    whatHappened: 'The port your container is trying to use is already being used by another running container (or another program).',
    why: 'Only one process can bind to a given port at a time — this is the containerized equivalent of the EADDRINUSE error.',
    fix: [
      'List running containers to find the conflict: docker ps',
      'Stop the conflicting container: docker stop <container-id>',
      'Or map your container to a different host port, e.g. -p 3001:3000 instead of -p 3000:3000'
    ]
  },
  {
    id: 'docker-image-not-found',
    category: 'general',
    pattern: /pull access denied|repository does not exist/i,
    whatHappened: "Docker couldn't find the image you asked for, or you don't have permission to access it.",
    why: 'Usually a typo in the image name/tag, or it\'s a private image and you\'re not logged in to the right registry.',
    fix: [
      'Double check the exact image name and tag for typos',
      'If it\'s a private image, log in first: docker login',
      'Search for the correct image name on Docker Hub if you\'re not sure it exists'
    ]
  },

  // ---------- Databases ----------
  {
    id: 'mongo-server-selection-error',
    category: 'general',
    pattern: /MongoServerSelectionError|MongooseServerSelectionError/i,
    whatHappened: "Your app couldn't connect to your MongoDB database.",
    why: 'The database server isn\'t running, the connection string is wrong, or (for MongoDB Atlas) your current IP address isn\'t on the allowed list.',
    fix: [
      'If running MongoDB locally, make sure it\'s actually started',
      'Double check your connection string (host, port, username, password) for typos',
      'If using MongoDB Atlas, check Network Access settings and add your current IP address to the allow list'
    ]
  },
  {
    id: 'mysql-access-denied',
    category: 'general',
    pattern: /ER_ACCESS_DENIED_ERROR/i,
    whatHappened: 'MySQL rejected your login — the username or password is wrong.',
    why: 'Either a typo in your credentials, or the database user genuinely doesn\'t have permission to connect from where you\'re connecting.',
    fix: [
      'Double check the username and password in your connection config',
      'Confirm the user has permission to connect from your host (some MySQL setups restrict by host/IP)',
      "If you're not sure of the password, you may need to reset it via an admin account"
    ]
  },
  {
    id: 'postgres-role-not-exist',
    category: 'general',
    pattern: /role "([^"]+)" does not exist/i,
    whatHappened: "PostgreSQL doesn't recognize the username you're trying to connect with.",
    why: "The 'role' PostgreSQL is complaining about is its term for a user account — it either doesn't exist yet, or there's a typo in the username.",
    fix: [
      'Check for typos in the username in your connection string/config',
      'If the user genuinely needs to be created: create it with createuser <username> (run as an existing admin/postgres user)',
      'On some setups, the default user matches your OS username — check what that is if you didn\'t set one explicitly'
    ]
  },
  {
    id: 'postgres-connection-refused',
    category: 'general',
    pattern: /could not connect to server: Connection refused/i,
    whatHappened: "Your app couldn't reach the PostgreSQL server at all.",
    why: 'PostgreSQL isn\'t running, or it\'s running on a different host/port than what your app is configured to use.',
    fix: [
      'Check that PostgreSQL is actually running (e.g. pg_isready, or check your system services)',
      'Confirm the host and port in your connection string match where PostgreSQL is actually listening (default port is 5432)',
      'If using Docker, make sure the container is up and the port is properly published'
    ]
  },

  // ---------- Lower-level languages ----------
  {
    id: 'cpp-undefined-reference',
    category: 'general',
    pattern: /undefined reference to/i,
    whatHappened: "Your program compiled, but the linker couldn't find the actual code for a function you're using.",
    why: 'You declared or called a function, but its implementation (.c/.cpp file, or a library) was never compiled in or linked — a common cause is forgetting to link a library, or a typo\'d function signature that doesn\'t match its declaration.',
    fix: [
      'Check the exact function name in the error for typos, including argument types (C++ is picky about exact signatures)',
      'Make sure the .c/.cpp file containing that function is included in your build/compile command',
      'If it\'s from an external library, make sure you\'re linking it (e.g. -lname flag) and that the library is actually installed'
    ]
  },
  {
    id: 'rust-borrow-checker',
    category: 'general',
    pattern: /cannot borrow .* as mutable|does not live long enough|value borrowed here after move/i,
    whatHappened: "Rust's compiler blocked this code because it violates Rust's memory safety rules around ownership and borrowing.",
    why: 'Rust is being strict on purpose here — this class of error is exactly what prevents memory bugs at compile time rather than runtime, but it does mean you need to restructure how a value is being shared or reused.',
    fix: [
      'Read the specific message carefully — Rust\'s compiler errors usually explain precisely which rule was violated and often suggest a fix directly',
      'Common fixes: clone the value if you need an independent copy (.clone()), restructure to avoid multiple mutable references at once, or adjust lifetimes',
      'The Rust book\'s ownership chapter (https://doc.rust-lang.org/book/ch04-00-understanding-ownership.html) is worth a read if this keeps coming up'
    ]
  },


  // ---------- Java ----------
  {
    id: 'java-nullpointer',
    category: 'general',
    pattern: /Exception in thread "\w+" java\.lang\.NullPointerException/,
    whatHappened: "Your code tried to use an object that doesn't actually exist (it's null).",
    why: 'A variable was declared but never assigned a real value, or a method that was supposed to return an object returned null instead, and your code tried to use it anyway.',
    fix: [
      'Check the line number in the stack trace for the variable being used',
      'Add a null check before using it, e.g. if (myVariable != null) { ... }',
      'Trace back where that variable was supposed to be assigned — a method call earlier likely returned null unexpectedly'
    ]
  },
  {
    id: 'java-array-index',
    category: 'general',
    pattern: /ArrayIndexOutOfBoundsException/,
    whatHappened: 'Your code tried to access a position in an array that doesn\'t exist.',
    why: 'This usually happens when a loop runs one time too many, or you assumed an array was a certain size when it wasn\'t.',
    fix: [
      'Check the index mentioned in the error against the array\'s actual length (array.length)',
      'Double check loop bounds — a very common cause is looping with <= instead of < against the array length'
    ]
  },
  {
    id: 'java-class-not-found',
    category: 'general',
    pattern: /ClassNotFoundException|NoClassDefFoundError|Could not find or load main class/,
    whatHappened: "Java couldn't find a class it needed — either the one you asked it to run, or one your code depends on.",
    why: 'Usually the compiled .class file is missing, the classpath isn\'t set correctly, or there\'s a typo in the class name.',
    fix: [
      'Double check the class name for typos (Java is case-sensitive)',
      'Make sure you compiled the file first (javac YourFile.java) before running it (java YourFile)',
      'If it\'s a library class, check the classpath includes the right .jar file (-cp path/to/library.jar)'
    ]
  },
  {
    id: 'java-arithmetic',
    category: 'general',
    pattern: /ArithmeticException: \/ by zero/,
    whatHappened: 'Your Java code tried to divide a number by zero.',
    why: 'Same root issue as any divide-by-zero bug — a variable being used as a divisor turned out to be 0 at runtime.',
    fix: [
      'Add a check before dividing: if (divisor != 0) { ... }',
      'Trace back where the divisor\'s value comes from to see why it ended up as zero'
    ]
  },
  {
    id: 'java-classcast',
    category: 'general',
    pattern: /ClassCastException/,
    whatHappened: 'Your code tried to treat an object as a type it actually isn\'t.',
    why: 'This often happens when casting a general type (like Object) to a more specific one, but the actual object underneath is a different, incompatible type.',
    fix: [
      'Check the exact types mentioned in the error message (it names both the actual type and the type it tried to cast to)',
      'Use "instanceof" to check the actual type before casting: if (obj instanceof MyType) { ... }'
    ]
  },
  {
    id: 'java-numberformat',
    category: 'general',
    pattern: /NumberFormatException/,
    whatHappened: "Your code tried to convert text into a number, but the text wasn't a valid number.",
    why: 'Common causes: user input that isn\'t purely numeric, or parsing text that has extra whitespace, currency symbols, or commas in it.',
    fix: [
      'Check exactly what text was being parsed (the error message usually shows it)',
      'Trim/clean the string before parsing: text.trim()',
      'Validate the input is actually numeric before calling Integer.parseInt() or Double.parseDouble()'
    ]
  },
  {
    id: 'java-stackoverflow',
    category: 'general',
    pattern: /StackOverflowError/,
    whatHappened: 'A method kept calling itself (or other methods) too deeply, until Java ran out of space to track it all.',
    why: 'Almost always a recursive method missing its stopping condition, similar to Python\'s RecursionError.',
    fix: [
      'Check that your recursive method has a clear base case that actually gets reached',
      'Add a print/log statement to see what values it\'s being called with right before it fails'
    ]
  },
  {
    id: 'java-outofmemory',
    category: 'general',
    pattern: /OutOfMemoryError: Java heap space/,
    whatHappened: 'Your Java program ran out of allocated memory.',
    why: 'Often caused by loading a very large file/dataset all at once, or a collection (List/Map) that keeps growing without ever being cleared.',
    fix: [
      'Try increasing heap size when running: java -Xmx2g YourProgram (allows up to 2GB, adjust as needed)',
      'Look for collections that grow unbounded in a loop without ever being cleared',
      'Process large data in smaller chunks rather than loading everything into memory at once'
    ]
  },
  {
    id: 'java-compile-cannot-find-symbol',
    category: 'general',
    pattern: /error: cannot find symbol/,
    whatHappened: "The Java compiler doesn't recognize a variable, method, or class name you used.",
    why: 'Usually a typo, a missing import, or using a variable outside the scope (block/method) where it was declared.',
    fix: [
      'Check the exact name shown in the error for typos',
      'If it\'s a class from another package, make sure you have the right import statement at the top of the file',
      'Check the variable is declared in a scope that\'s actually visible at the line where you\'re using it'
    ]
  },

  // ---------- C# / .NET ----------
  {
    id: 'csharp-nullreference',
    category: 'general',
    pattern: /System\.NullReferenceException: Object reference not set to an instance of an object/,
    whatHappened: "Your code tried to use an object that doesn't actually exist (it's null).",
    why: 'A variable was declared but never assigned, or a method that was expected to return an object returned null instead.',
    fix: [
      'Check the line number shown in the stack trace for the variable being used',
      'Add a null check before using it: if (myVariable != null) { ... } or use the null-conditional operator: myVariable?.SomeMethod()',
      'Trace back where that variable was supposed to be assigned'
    ]
  },
  {
    id: 'csharp-index-out-of-range',
    category: 'general',
    pattern: /System\.IndexOutOfRangeException/,
    whatHappened: 'Your code tried to access a position in an array or list that doesn\'t exist.',
    why: 'Usually a loop that runs one iteration too many, or an assumption about a collection\'s size that turned out to be wrong.',
    fix: [
      'Check the index being used against the actual .Length (arrays) or .Count (lists)',
      'Double check loop bounds, especially off-by-one errors with <= vs <'
    ]
  },
  {
    id: 'csharp-file-not-found',
    category: 'general',
    pattern: /System\.IO\.FileNotFoundException/,
    whatHappened: "Your program tried to open a file that doesn't exist at the path it used.",
    why: 'Often a relative path issue — the program might be running from a different working directory than you expect.',
    fix: [
      'Check the exact path in the exception message for typos',
      'Use an absolute path, or verify the current working directory matches your assumption',
      'Confirm the file is actually being copied to the output folder if it\'s meant to be bundled with the build'
    ]
  },
  {
    id: 'csharp-compile-cs0103',
    category: 'general',
    pattern: /error CS0103: The name '([^']+)' does not exist in the current context/,
    whatHappened: "The C# compiler doesn't recognize a variable or method name you used.",
    why: 'Usually a typo, a missing using directive, or referencing a variable outside the scope where it was declared.',
    fix: [
      'Check the exact name shown in the error for typos',
      'Make sure you have the right "using" statement at the top of the file if it\'s from another namespace',
      'Check the variable is actually in scope at the line where you\'re using it'
    ]
  },
  {
    id: 'dotnet-restore-failed',
    category: 'general',
    pattern: /error NU1101|NuGet package .* could not be found/i,
    whatHappened: "NuGet couldn't find a package your project depends on.",
    why: 'Usually a typo in the package name, or the package source/feed isn\'t configured correctly.',
    fix: [
      'Double check the exact package name and casing in your .csproj file',
      'Run: dotnet restore to try fetching dependencies again',
      'Check your NuGet package sources are configured correctly (nuget.config)'
    ]
  },

  // ---------- Test frameworks & linters ----------
  {
    id: 'pytest-failed',
    category: 'python',
    pattern: /={3,}\s*FAILURES\s*={3,}|^FAILED /m,
    whatHappened: 'One or more of your pytest tests failed.',
    why: 'The test ran, but the actual result didn\'t match what the test expected — pytest shows exactly which assertion failed and the values involved.',
    fix: [
      'Scroll up to see the specific assertion that failed and the expected vs actual values',
      'Run just that one failing test for a focused look: pytest path/to/test_file.py::test_name -v',
      'If the expected value itself is wrong (not the code), update the test rather than the code'
    ]
  },
  {
    id: 'jest-failed',
    category: 'node',
    pattern: /expect\(received\)\.\w+/,
    whatHappened: 'One or more of your Jest tests failed.',
    why: 'The test ran, but the actual value didn\'t match what was expected in the assertion.',
    fix: [
      'Look at the "Expected" vs "Received" values shown right after this line — that\'s the exact mismatch',
      'Run just this one test file for a focused look: npx jest path/to/test.file.js',
      'If the expectation itself is outdated (not a real bug), update the test'
    ]
  },
  {
    id: 'eslint-no-undef',
    category: 'node',
    pattern: /'([^']+)' is not defined\s+no-undef/,
    whatHappened: "ESLint flagged a variable that's used but never declared anywhere.",
    why: 'Usually a typo in a variable name, or a missing import — ESLint catches this before you even run the code.',
    fix: [
      'Check the exact variable name for typos',
      'If it should come from another module, make sure you\'ve imported it',
      'If it\'s a global provided by your environment (like "window" in browser code), configure ESLint\'s env settings to recognize it'
    ]
  },

  // ---------- Build tools ----------
  {
    id: 'maven-build-failure',
    category: 'general',
    pattern: /BUILD FAILURE/,
    whatHappened: 'Maven stopped because one of the build steps failed.',
    why: 'Could be a compile error, a failing test, or a missing dependency — Maven shows the specific failing step just above this line.',
    fix: [
      'Scroll up from "BUILD FAILURE" to find the actual error — Maven usually shows it directly above',
      'Run with more detail if needed: mvn clean install -e (shows full stack traces)',
      'If it\'s dependency-related, try: mvn dependency:resolve to see what\'s missing'
    ]
  },
  {
    id: 'gradle-task-failed',
    category: 'general',
    pattern: /Execution failed for task/,
    whatHappened: 'Gradle stopped because one of its build tasks failed.',
    why: 'Gradle names the specific task that failed — the real underlying error is usually shown just below this line.',
    fix: [
      'Read the text right after this line — it names the specific task and usually the real cause',
      'Run with --stacktrace for more detail: ./gradlew build --stacktrace',
      'Try a clean build if the failure seems inconsistent: ./gradlew clean build'
    ]
  },
  {
    id: 'cmake-error',
    category: 'general',
    pattern: /CMake Error/,
    whatHappened: 'CMake couldn\'t generate your project\'s build files.',
    why: 'Common causes: a missing dependency/library CMake can\'t find, or a mistake in your CMakeLists.txt configuration.',
    fix: [
      'Read the specific error text right after "CMake Error" — it usually names the exact missing package or file',
      'If it\'s a missing library, install it via your system\'s package manager and try again',
      'Delete the build folder and re-run cmake fresh if the cache seems stale/corrupted'
    ]
  },


  // ---------- Go ----------
  {
    id: 'go-index-out-of-range',
    category: 'general',
    pattern: /panic: runtime error: index out of range/,
    whatHappened: 'Your Go program crashed because it tried to access a position in a slice/array that doesn\'t exist.',
    why: 'This usually happens when a loop runs one iteration too many, or you assumed a slice was a certain length when it wasn\'t.',
    fix: [
      'Check the index shown in the error against the slice\'s actual length using len(yourSlice)',
      'Double check loop bounds — a common cause is looping with <= instead of < against the length'
    ]
  },
  {
    id: 'go-nil-map',
    category: 'general',
    pattern: /panic: assignment to entry in nil map/,
    whatHappened: "Your code tried to write to a map that was never actually created.",
    why: "In Go, declaring a map variable (var m map[string]int) doesn't create it — it stays nil until you explicitly initialize it with make().",
    fix: [
      'Initialize the map before using it: m := make(map[string]int)',
      'Or use a map literal if you know some initial values: m := map[string]int{}'
    ]
  },
  {
    id: 'go-nil-pointer',
    category: 'general',
    pattern: /panic: runtime error: invalid memory address or nil pointer dereference/,
    whatHappened: "Your code tried to use a pointer that doesn't actually point to anything (it's nil).",
    why: 'A variable was declared as a pointer but never assigned an actual value, or a function that was expected to return a valid pointer returned nil instead.',
    fix: [
      'Check the line in the stack trace for the pointer variable being used',
      'Add a nil check before using it: if myPointer != nil { ... }',
      'Trace back where that pointer was supposed to be assigned'
    ]
  },
  {
    id: 'go-undefined',
    category: 'general',
    pattern: /:\d+:\d+: undefined: (\w+)/,
    whatHappened: "The Go compiler doesn't recognize a variable or function name you used.",
    why: 'Usually a typo, or using something before it\'s declared, or forgetting to import the package it comes from.',
    fix: [
      'Check the exact name shown in the error for typos',
      'If it\'s from another package, make sure you\'ve imported it at the top of the file',
      'Check the variable is actually declared before the line where you\'re using it'
    ]
  },
  {
    id: 'go-module-not-found',
    category: 'general',
    pattern: /no required module provides package/,
    whatHappened: "Go couldn't find a package your code is trying to import.",
    why: 'Either the package path has a typo, or your project isn\'t set up as a Go module yet (or the dependency was never added to it).',
    fix: [
      'If you haven\'t already, initialize a Go module: go mod init your-module-name',
      'Add the missing dependency: go get <package-path>',
      'Double check the import path for typos, including the exact GitHub username/repo casing'
    ]
  },

  // ---------- Kotlin ----------
  {
    id: 'kotlin-null-pointer',
    category: 'general',
    pattern: /kotlin\.KotlinNullPointerException|kotlin\.TypeCastException/,
    whatHappened: "Your code used the !! operator to say \"trust me, this isn't null\" — but it actually was null.",
    why: "Kotlin normally blocks you from using null values by mistake at compile time, but the !! operator overrides that safety check, and it just crashed at runtime because that override was wrong.",
    fix: [
      'Find the !! in the line shown in the stack trace',
      'Replace it with a safe call instead: myVariable?.doSomething() (does nothing if null, instead of crashing)',
      'Or use myVariable?.doSomething() ?: defaultValue to provide a fallback when it\'s null'
    ]
  },
  {
    id: 'kotlin-uninitialized-property',
    category: 'general',
    pattern: /kotlin\.UninitializedPropertyAccessException/,
    whatHappened: "Your code tried to use a 'lateinit' property before it was actually assigned a value.",
    why: '"lateinit" tells Kotlin "I promise to set this before using it" — but something used it earlier than that assignment actually happened.',
    fix: [
      'Check the initialization order — make sure the lateinit property is assigned before anything tries to read it',
      'If it\'s set in a lifecycle method (like onCreate in Android), make sure nothing runs before that method completes',
      'Consider using a nullable type with a default instead of lateinit if the ordering is hard to guarantee'
    ]
  },
  {
    id: 'kotlin-index-out-of-bounds',
    category: 'general',
    pattern: /java\.lang\.IndexOutOfBoundsException.*kotlin|kotlin\.collections/,
    whatHappened: 'Your Kotlin code tried to access a position in a list that doesn\'t exist.',
    why: 'This usually happens when a loop runs one time too many, or you assumed a list was a certain size when it wasn\'t.',
    fix: [
      'Check the index against the list\'s actual size using list.size',
      'Consider using list.getOrNull(index) instead, which returns null instead of crashing if the index is invalid'
    ]
  },


  // ---------- Ruby ----------
  {
    id: 'ruby-nomethod-nil',
    category: 'general',
    pattern: /NoMethodError: undefined method '([^']+)' for nil/,
    whatHappened: "Your code tried to call a method on something that turned out to be nil (Ruby's version of null/nothing).",
    why: 'A variable was expected to hold a real object but was nil instead — often because a method that should have returned something returned nil, or a hash/array lookup came up empty.',
    fix: [
      'Check the line number shown in the error for the variable that\'s nil',
      'Add a nil check before calling the method: if my_var then my_var.some_method end',
      'Or use the safe navigation operator: my_var&.some_method (does nothing if nil, instead of crashing)'
    ]
  },
  {
    id: 'ruby-nameerror',
    category: 'general',
    pattern: /NameError: undefined local variable or method '([^']+)'/,
    whatHappened: "Your code used a variable or method name that Ruby has never seen before.",
    why: 'Usually a typo, using a variable before it\'s assigned, or forgetting to require a file/gem that defines it.',
    fix: [
      'Check for typos in the name shown in the error',
      'Make sure the variable is assigned before the line where it\'s used',
      'If it\'s from a gem, check you have require \'gem_name\' at the top of the file'
    ]
  },
  {
    id: 'ruby-loaderror',
    category: 'general',
    pattern: /LoadError: cannot load such file/,
    whatHappened: "Ruby couldn't find a file or gem your code tried to require.",
    why: "Either the gem isn't installed, or there's a typo in the require path.",
    fix: [
      'Run: bundle install (if using Bundler) to install missing gems from your Gemfile',
      'Or install it directly: gem install <gem-name>',
      'Double check the exact name/path in the require statement for typos'
    ]
  },
  {
    id: 'ruby-zerodivision',
    category: 'general',
    pattern: /ZeroDivisionError: divided by 0/,
    whatHappened: 'Your Ruby code tried to divide a number by zero.',
    why: 'A variable being used as a divisor turned out to be 0 at runtime.',
    fix: [
      'Add a check before dividing: if divisor != 0 ... end',
      'Trace back where the divisor\'s value comes from'
    ]
  },
  {
    id: 'ruby-argumenterror',
    category: 'general',
    pattern: /ArgumentError: wrong number of arguments/,
    whatHappened: "You called a method with the wrong number of arguments.",
    why: 'The method definition expects a specific number of arguments (or a range), and this call didn\'t match.',
    fix: [
      'Check the method\'s definition to see exactly what arguments it expects',
      'Count the arguments you\'re actually passing at the call site shown in the error'
    ]
  },

  // ---------- PHP ----------
  {
    id: 'php-call-on-null',
    category: 'general',
    pattern: /Fatal error: Uncaught Error: Call to a member function \w+\(\) on null/,
    whatHappened: "Your code tried to call a method on a variable that's null.",
    why: 'A variable expected to hold an object was actually null — often because a function that was supposed to return an object returned null instead (e.g. a database query that found no results).',
    fix: [
      'Check the line number shown in the error for the variable being used',
      'Add a null check before calling the method: if ($myVar !== null) { $myVar->method(); }',
      'Or use the null-safe operator (PHP 8+): $myVar?->method()'
    ]
  },
  {
    id: 'php-class-not-found',
    category: 'general',
    pattern: /Fatal error: Uncaught Error: Class "([^"]+)" not found/,
    whatHappened: "PHP couldn't find a class your code is trying to use.",
    why: 'Usually a missing "use" import statement, an autoloader that isn\'t set up correctly, or a typo in the class name.',
    fix: [
      'Check the exact class name for typos, including namespace casing',
      'Make sure you have a "use" statement for it if it\'s in a different namespace',
      'If using Composer, make sure you ran composer dump-autoload after adding new classes'
    ]
  },
  {
    id: 'php-parse-error',
    category: 'general',
    pattern: /Parse error: syntax error, unexpected/,
    whatHappened: 'PHP found something that breaks its syntax rules before it could even run your code.',
    why: 'Often a missing semicolon, an unclosed bracket/quote, or a stray character from copy-pasted code.',
    fix: [
      'Check the exact line shown in the error (PHP usually points to it precisely, though sometimes the real issue is on the line just before)',
      'Look for a missing semicolon, unclosed bracket, or quote'
    ]
  },
  {
    id: 'php-undefined-variable',
    category: 'general',
    pattern: /Warning: Undefined variable \$(\w+)/,
    whatHappened: "Your code used a variable that was never actually set.",
    why: 'Usually a typo in the variable name, or using it outside the scope where it was defined.',
    fix: [
      'Check the exact variable name for typos',
      'Make sure the variable is assigned before the line where it\'s used',
      'Initialize it with a default value if it\'s conditionally set, e.g. $myVar = $myVar ?? \'\';'
    ]
  },

  // ---------- Swift ----------
  {
    id: 'swift-nil-unwrap',
    category: 'general',
    pattern: /Fatal error: Unexpectedly found nil while unwrapping an Optional value/,
    whatHappened: "Your code used the ! operator to force-unwrap a value, claiming it definitely has a value — but it was actually nil.",
    why: "Swift's Optionals require you to explicitly handle the case where a value might not exist. The ! operator skips that safety check, and it just crashed because that assumption was wrong.",
    fix: [
      'Find the ! in the line shown in the crash location',
      'Replace it with safe unwrapping: if let value = myOptional { ... } or guard let value = myOptional else { return }',
      'Or provide a default with the nil-coalescing operator: myOptional ?? defaultValue'
    ]
  },
  {
    id: 'swift-index-out-of-range',
    category: 'general',
    pattern: /Fatal error: Index out of range/,
    whatHappened: 'Your Swift code tried to access a position in an array that doesn\'t exist.',
    why: 'This usually happens when a loop runs one iteration too many, or an assumption about an array\'s size turned out to be wrong.',
    fix: [
      'Check the index against the array\'s actual count using array.count',
      'Consider using array.indices.contains(index) to check safely before accessing'
    ]
  },
  {
    id: 'swift-cannot-find-in-scope',
    category: 'general',
    pattern: /error: cannot find '([^']+)' in scope/,
    whatHappened: "The Swift compiler doesn't recognize a variable, function, or type name you used.",
    why: 'Usually a typo, a missing import, or using something outside the scope where it was declared.',
    fix: [
      'Check the exact name shown in the error for typos',
      'If it\'s from a framework or package, make sure you have the right import statement at the top of the file',
      'Check it\'s actually declared and visible in the current scope'
    ]
  },
  {
    id: 'swift-bad-access',
    category: 'general',
    pattern: /EXC_BAD_ACCESS/,
    whatHappened: 'Your app crashed trying to access memory it shouldn\'t have.',
    why: 'Common causes: using an object after it was already deallocated, or a low-level memory/threading bug.',
    fix: [
      'Check for strong reference cycles or objects being deallocated too early (common with delegates — consider using "weak" references)',
      'If this happens in multi-threaded code, check for a variable being accessed from multiple threads unsafely'
    ]
  },

  // ---------- C / C++ additions ----------
  {
    id: 'cpp-not-declared',
    category: 'general',
    pattern: /error: '([^']+)' was not declared in this scope/,
    whatHappened: "The C++ compiler doesn't recognize a variable or function name you used.",
    why: 'Usually a typo, a missing #include, or using a variable outside the block where it was declared.',
    fix: [
      'Check the exact name shown in the error for typos',
      'Make sure you have the right #include for it, if it\'s from a library',
      'Check the variable is declared in a scope that\'s actually visible at this line (C++ scoping is based on { } blocks)'
    ]
  },
  {
    id: 'cpp-expected-semicolon',
    category: 'general',
    pattern: /error: expected ';' before/,
    whatHappened: 'The C/C++ compiler expected a semicolon but found something else.',
    why: 'Almost always a missing semicolon at the end of the previous statement or line.',
    fix: [
      'Check the line just above the one mentioned in the error — that\'s usually where the missing semicolon actually belongs',
      'Look for the end of the previous statement/declaration'
    ]
  },
  {
    id: 'cpp-double-free',
    category: 'general',
    pattern: /double free or corruption/,
    whatHappened: 'Your program tried to free the same piece of memory twice.',
    why: 'Common causes: calling free()/delete on the same pointer more than once, or two different pointers both pointing to the same memory both getting freed.',
    fix: [
      'Check every free()/delete call on this pointer — make sure each allocation is freed exactly once',
      'Set pointers to NULL/nullptr immediately after freeing them, so accidentally freeing again is easier to catch',
      'Consider using smart pointers (C++) like std::unique_ptr to avoid manual memory management entirely'
    ]
  },

  {
    id: 'command-not-found',
    category: 'general',
    pattern: /command not found|is not recognized as an internal or external command|is not recognized as the name of a cmdlet/i,
    whatHappened: "Your terminal doesn't recognize the command you typed.",
    why: "Either there's a typo, the program isn't installed, or it's installed but not added to your system's PATH.",
    fix: [
      'Double check for typos in the command name',
      'Confirm the tool is installed (e.g. node -v, python --version, git --version)',
      "If it's installed but still not found, its install location likely isn't in your PATH — reinstalling or restarting your terminal often fixes this"
    ],
    dynamicFix: commandNotFoundFix
  },
  {
    id: 'permission-denied-general',
    category: 'general',
    pattern: /Permission denied/i,
    whatHappened: "You tried to run or access something you don't have permission for.",
    why: 'A file may need executable permission, or it belongs to a different user/account.',
    fix: [
      'To make a script executable: chmod +x ./yourscript.sh',
      'Check file ownership with ls -la, and fix it with chown if needed',
      'Avoid using sudo as a first fix — it can create new permission problems later'
    ]
  },
  {
    id: 'segfault',
    category: 'general',
    pattern: /Segmentation fault/i,
    whatHappened: 'Your program crashed because it tried to access memory it wasn\'t allowed to.',
    why: 'This is common in lower-level languages (C, C++, Rust with unsafe code) — often from an invalid pointer, an array accessed out of bounds, or a stack overflow from infinite recursion.',
    fix: [
      'Check for array/list access with an index that could go out of bounds',
      'Check for infinite or very deep recursion',
      "If using a debugger, tools like gdb (Linux/Mac) or a memory checker like valgrind can pinpoint the exact line"
    ]
  },
  {
    id: 'out-of-memory',
    category: 'general',
    pattern: /JavaScript heap out of memory|MemoryError|Killed \(OOM\)/i,
    whatHappened: 'Your program ran out of memory and was stopped before it could finish.',
    why: 'Often caused by processing a very large file/dataset all at once, an infinite loop that keeps creating data, or a memory leak.',
    fix: [
      'For Node.js: try increasing memory with: node --max-old-space-size=4096 yourscript.js',
      'Look for loops that keep adding to an array/object without ever clearing it',
      'For large files/datasets, process data in smaller chunks/batches instead of loading everything at once'
    ]
  },
  {
    id: 'connection-refused',
    category: 'general',
    pattern: /ECONNREFUSED/i,
    whatHappened: 'Your program tried to connect to a server (database, API, etc.) but nothing answered.',
    why: 'The service you\'re connecting to isn\'t running, is running on a different port, or a firewall is blocking the connection.',
    fix: [
      'Check that the target service is actually running (e.g. your local database or dev server)',
      'Double check the host/port in your connection string or config matches what the service is actually using',
      'If connecting to a remote service, check your internet connection and any firewall/VPN settings'
    ]
  },
  {
    id: 'timeout',
    category: 'general',
    pattern: /ETIMEDOUT|operation timed out/i,
    whatHappened: 'A request or connection took too long and gave up waiting.',
    why: 'This could be a slow/unreliable network, a server that\'s down or overloaded, or a firewall silently dropping the connection.',
    fix: [
      'Check your internet connection',
      'Try the same request again — it may just be a temporary slowdown',
      "If it's consistent, check the target server's status page or try a different network"
    ]
  },
  {
    id: 'dns-not-found',
    category: 'general',
    pattern: /ENOTFOUND|getaddrinfo ENOTFOUND/i,
    whatHappened: "Your computer couldn't find the server address you were trying to reach.",
    why: "Usually a typo in a URL/hostname, no internet connection, or the domain genuinely doesn't exist/resolve.",
    fix: [
      'Double check the URL/hostname for typos',
      'Check your internet connection',
      'Try opening the same address in a browser to confirm it resolves'
    ]
  },
  {
    id: 'disk-full',
    category: 'general',
    pattern: /No space left on device/i,
    whatHappened: 'Your disk is completely full, so the operation couldn\'t save/write anything.',
    why: 'Build artifacts, logs, node_modules, or Docker images can silently eat up disk space over time.',
    fix: [
      'Check disk usage: df -h (Mac/Linux) or check Storage settings on Windows',
      'Common space-hogs to clean: node_modules folders you no longer need, Docker images (docker system prune), old log files',
      'Free up space, then re-run your command'
    ]
  },
  {
    id: 'invalid-json',
    category: 'general',
    pattern: /Unexpected token .* in JSON at position \d+|JSON\.parse/i,
    whatHappened: 'Something tried to read text as JSON, but the text isn\'t valid JSON.',
    why: 'Common causes: a trailing comma, missing quotes around keys, or the "JSON" is actually an error page/HTML returned by a server instead of real data.',
    fix: [
      'If this came from an API call, log the raw response text before parsing to see what was actually returned',
      'Check for trailing commas or unquoted keys if this is a local JSON file',
      'Validate the JSON using a linter or an online JSON validator to find the exact broken spot'
    ]
  }
];
