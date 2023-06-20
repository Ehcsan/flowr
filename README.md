# flowr



A program slicer and analyzer for R programs.

----

*flowr* is actively developed by *Florian Sihler* (contact at: <florian.sihler@uni-ulm.de>) under the 
[GPLv3 License](LICENSE) as part of his master's thesis.

----


## Setup

To work with *flowr* you need [*R*](https://www.r-project.org/) installed and on your path.

### Development

For development, we encourage you to enable the project-specific git-hooks by running:

```shell
git config --local core.hooksPath .githooks/
```


## Usage

### Produce a Static Slice

See,

```shell
npm run slicer -- --help 
```

For example, you can run

```shell
npm run slicer -- --stats --criterion "8:3;3:1;12@product" test/testfiles/example.R
```

Inspect the resulting slice at [`test/testfiles/example.R.slice`](test/testfiles/example.R.slice) , with the stats at
[`test/testfiles/example.R.stats`](test/testfiles/example.R.stats) .

### Generate Usage Statistics

See

```shell
npm run stats -- --help 
```

### Export RDF N-Quads

See

```shell
npm run export-quads -- --help 
```
