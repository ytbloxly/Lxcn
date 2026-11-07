# Lxcn
Lxcn (pronouncation: ˈlɛk.sɪ.kɒn)
Lxcn is a small, JavaScript-interpreted programming language with a VS Code extension.

## File extensions
`.lx`, `.lxc`, `.lxcn`

## Hello World
```lxcn
# Prints in the output
console.log("Hello World!")
```

## Variables
```lxcn
int age = 20
double price = 24.99
char grade = 'A'
string userName = "Code123"
bool isActive = true

ver changing = 2
changing = "two"
var another = 3
another = "three"

const var surname = "Doe"
int optionalAge? = none
```

`ver` is block-scoped and has a temporal dead zone (using it before its declaration is an error).
`var` is function-scoped and dynamically typed. Static declarations enforce their declared type.
Optional static variables accept their declared type or `none`.

## Conditions
```lxcn
var num = 5
if num == 5 then
    console.log(num)
elseif num == (int) then
    console.log(num == (int))
else then
    console.log(`{num} isnt working on both situations!`)
end
```

## Loops
```lxcn
for loop(int i = 0, i < 10, i++) do
    console.log(i)
end
```

## Comments
- `#` starts a single-line comment.
- A line containing `===` starts or ends a multiline comment.

## VS Code
1. Install the `.vsix` package using **Extensions: Install from VSIX...**.
2. Open a `.lx`, `.lxc` or `.lxcn` file.
3. Click the **Run** (play) icon in the editor title bar, or run **Lxcn: Run Current File** from the Command Palette.
4. Program output appears in the **Lxcn** Output channel.

No F5/debug configuration is required.

## Current v0.1 scope
The interpreter supports the syntax demonstrated above, typed variable declarations and assignments, dynamic `ver`/`var`, constants, optional typed variables, casts, type checks, `if`/`elseif`/`else`/`end`, C-style `for loop`, comments, template interpolation and JavaScript increment/decrement operators.

This is an initial interpreter, not yet a complete production language. See `ROADMAP.md` for planned improvements.
