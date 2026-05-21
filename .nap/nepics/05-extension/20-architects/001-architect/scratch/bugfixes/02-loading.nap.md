


* //DU: some thoughts:
  * simple steps focusing on business logic
    * errors report if it's retriable or not
  * ui that shows transparent and simple status
    * static nice list of steps and status of each
      * leads to having both state and ui transparent and nice
  * mid-flight close doesn't break things
    * leverage "atomic" state management that guards the intermediate state
    * mid-step failure
      * happen in tmp "staging" area invisible to outside world
      * e.g. just name it .tmp-<repo-name> while cloning
        * when that succeeded:
          * do "atomically":
            * move the repo
            * report success
            * // yeah, i know, this is mostly faking the transaction
            * // but we don't have cas and transactions for things like that
            * // or what would be the most simple pragmatic equivalent of 
              * // of kinda transaction mechanics?
        * user sees:
          * step state = not started
          * step state = in-progress (atomic enter)
            * <cloning>... => until it errored out or succeeded
          * step state = error
            * user sees description with {retry} button
              * (e.g. auth failure)
              * (e.g. no connection)
            * user fixes inputs
              * (enter tokens)
              * (connect to wifi)
            * user clicks {retry} -> step state = not started 
              * back to started
          * step state = success
            * checkmark on that step
          * go to next one
  * simple retry + ui transparency strategy


