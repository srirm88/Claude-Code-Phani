# Evidence-gathering playbook (AIX 7.3, ACE 12.0.12.0)

Give the user the **smallest set of commands that discriminates between your
hypotheses**, not a dump. Say what each command would show under each hypothesis
before they run it.

Flags vary between ACE levels and between node-managed and independent
integration servers. Confirm with `<command> -h` rather than trusting a flag
from memory, and check which server model is in use before assuming.

## ACE administration

```ksh
# what exists and what state it is in
mqsilist
mqsilist <node> -e <server> -d 2          # deployed resources, verbose

# effective configuration of a running server
mqsireportproperties <node> -e <server> -o ComIbmJVMManager -r
mqsireportproperties <node> -e <server> -o AllReportableEntityNames -r

# what is actually inside the BAR that was deployed
mqsireadbar -b OrderApp.bar -r            # every overridable property + value
```

`mqsireadbar` is the fastest way to settle "did the override apply?" — which is
the cause of a large share of works-in-SIT-fails-in-PRD incidents.

## User trace — powerful and expensive

User trace on a busy production integration server costs throughput and disk.
Say so before recommending it, scope it to one server, and turn it off.

```ksh
mqsichangetrace <node> -u -e <server> -l debug -r     # on, reset the log
# ... reproduce the failure, and only the failure ...
mqsichangetrace <node> -u -e <server> -l none         # OFF. Do not forget.

mqsireadlog  <node> -u -e <server> -f -o trace.xml
mqsiformatlog -i trace.xml -o trace.txt
```

Read `trace.txt` from the failure backwards. The last node reached before the
exception is where to look, not the node named in the outermost exception.

## MQ

```ksh
runmqsc <QMGR>
DIS QL(ORDER.IN) CURDEPTH MAXDEPTH BOTHRESH BOQNAME
DIS QSTATUS(ORDER.IN) TYPE(QUEUE) IPPROCS OPPROCS
DIS QL(ORDER.IN.BO) CURDEPTH
END
```

- `CURDEPTH` rising with `IPPROCS` at 0 → nothing is consuming; the flow is
  stopped, failed to deploy, or not connected.
- `CURDEPTH` rising with `IPPROCS` > 0 → consuming slower than arrival; look at
  additional instances and downstream latency.
- Backout queue filling → poison messages. **Read one before purging.** Purging
  destroys the evidence you need.
- `BOTHRESH` of 0 with a failing flow → infinite redelivery loop. This one pins a
  flow instance and can look like a hang.

## AIX

```ksh
# the integration server processes
ps -eo pid,ppid,pcpu,vsz,rss,etime,args | grep -i DataFlowEngine | grep -v grep

# memory for one of them, over time -- growth is the signal, not the value
svmon -P <pid> -O summary=basic

# system-level
topas                                    # live
errpt -a | more                          # AIX error report: hardware, ulimits, core dumps
df -g /var/mqsi                          # a full workpath breaks ACE in confusing ways
ulimit -a                                # as the ACE service user, not root

# abends and core files
ls -lt /var/mqsi/common/errors | head -20
```

`$MQSI_WORKPATH` defaults to `/var/mqsi`. Confirm it rather than assuming — a
non-default workpath is common and sends people looking in the wrong place.

**Take memory readings at intervals and compare.** A single `svmon` says nothing;
RSS growing steadily under constant load is the signal for a message-tree leak.

## Deploy failures

```ksh
mqsilist <node> -e <server> -d 2         # is it actually deployed?
mqsireadbar -b OrderApp.bar -r           # is the BAR what you think it is?
ls -lt /var/mqsi/common/errors | head     # deploy-time abends land here
```

A deploy that reports success but changes nothing usually means the BAR content
differs from the source that was built — check the build, not the broker.

## Discipline

- **Change one thing at a time.** Two simultaneous changes and you have learned
  nothing about either.
- **Restarting destroys evidence.** In-flight state, thread dumps, memory
  profile — all gone. If a restart is the immediate fix, capture the evidence
  first: `ps` output, `svmon`, the backout queue contents, `errpt`.
- **Never purge a backout or error queue before reading a message from it.**
- **Turn user trace off.** Left on, it becomes the next incident.
