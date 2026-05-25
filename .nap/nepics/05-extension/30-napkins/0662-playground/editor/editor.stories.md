# monaco command — stories

## MC1: open a file by name

* user in terminal, cwd is /home/user
* types `monaco playground.yaml`
* editor tab opens with playground.yaml content
* tab is permanent (not italic)
* surface switches to editor

## MC2: relative path from repo dir

* user `cd nap-test-nap/nepics/01-v1/30-napkins/0100-delivery-pipeline/mini-book`
* types `monaco 01-order-routing.md`
* editor opens the chapter
* tab shows `01-order-routing.md`

## MC3: absolute path

* types `monaco /home/user/nap-test-nap/nepics/01-v1/30-napkins/0100-delivery-pipeline/0100-delivery-pipeline.nap.md`
* editor opens the napkin file

## MC4: file doesn't exist

* types `monaco nonexistent.yaml`
* terminal shows error: `monaco: nonexistent.yaml: no such file`
* editor doesn't open a tab

## MC5: --help

* types `monaco --help`
* terminal shows: `usage: monaco <file>  — open file in editor`

## MC6: no args

* types `monaco`
* terminal shows same help text
