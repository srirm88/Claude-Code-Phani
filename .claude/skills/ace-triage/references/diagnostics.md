# Evidence-gathering playbook (AIX 7.3, ACE 12.0.12.26, MQ 9.3.0.35)

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

## MQ 9.3

```ksh
dspmqver                                  # confirm the level you are actually on
dspmq                                     # queue managers and their state
```

### Queue state

```ksh
runmqsc <QMGR>
DIS QL(ORDER.IN) CURDEPTH MAXDEPTH BOTHRESH BOQNAME
DIS QSTATUS(ORDER.IN) TYPE(QUEUE) IPPROCS OPPROCS
DIS QSTATUS(ORDER.IN) TYPE(HANDLE) ALL      -- which application has it open
DIS QL(ORDER.IN.BO) CURDEPTH
END
```

- `CURDEPTH` rising with `IPPROCS` at 0 → nothing is consuming; the flow is
  stopped, failed to deploy, or not connected. `TYPE(HANDLE)` proves whether the
  integration server is actually attached.
- `CURDEPTH` rising with `IPPROCS` > 0 → consuming slower than arrival; look at
  additional instances and downstream latency.
- `BOTHRESH` of 0 with a failing flow → infinite redelivery loop. Pins a flow
  instance and can present as a hang.

### Read a backed-out message WITHOUT destroying it

This is the single most valuable habit in ACE triage. The poison message is the
evidence; a purge throws away the only copy.

```ksh
amqsbcg ORDER.IN.BO <QMGR> > bo_dump.txt   # browse only, dumps MQMD + payload
```

`amqsbcg` uses `MQGET` with browse and cannot consume. Read `BackoutCount` and
`CorrelId` in the dumped MQMD — a `BackoutCount` climbing across browses
confirms a redelivery loop rather than a one-off failure.

`dmpmqmsg` also ships with MQ 9.3 and is more capable, but **confirm whether your
invocation browses or destructively gets before pointing it at a production
queue** — the default is not browse. When in doubt use `amqsbcg`.

### MQ error logs and FDCs

ACE exceptions carry an MQ reason code but not the MQ-side detail. That lives
here:

```ksh
ls -lt /var/mqm/qmgrs/<QMGR>/errors/AMQERR0*.LOG    # queue-manager scoped
ls -lt /var/mqm/errors/                             # qmgr-independent + FDCs
ls -lt /var/mqm/errors/*.FDC 2>/dev/null | head     # first-failure data capture
```

`AMQERR01.LOG` is current; 02 and 03 are older rotations. An FDC written at the
same timestamp as your ACE failure changes the diagnosis — that is an MQ defect
or resource problem, not a flow problem, and it is the point at which a PMR with
the FDC attached beats more flow debugging.

### Authorisation (MQ 2035)

```ksh
dspmqaut -m <QMGR> -n ORDER.IN -t queue -p <ace_service_user>
dspmqaut -m <QMGR> -t qmgr -p <ace_service_user>
```

2035 after a promotion is usually the service user missing authority in the new
environment, not a code change. Check the queue *and* the queue manager object —
`connect` and `inq` on the qmgr are needed as well as queue authority.

### Connection mode

ACE reaches MQ either in local bindings or as a client, decided by the MQEndpoint
policy or the node properties. It matters for diagnosis:

- **Bindings** — ACE and the queue manager must be on the same AIX LPAR, and the
  service user needs local `mqm` group membership.
- **Client** — a channel and listener are involved, so `DIS CHSTATUS(<channel>)`
  and the listener state become part of the picture, and 2059 may mean the
  listener rather than the queue manager.

```ksh
runmqsc <QMGR>
DIS CHSTATUS(<SVRCONN.CHANNEL>) ALL
DIS LSSTATUS(*) ALL
END
```

Establish which mode is in use before theorising. Chasing channel status on a
bindings-mode connection wastes an outage.

## AIX

```ksh
# POWER9 LPAR: is the partition itself starved? Check BEFORE blaming ACE.
lparstat 2 5                             # %entc > 100 sustained = borrowing from the pool
lparstat -i | grep -E 'Entitled|Online Virtual|Mode|Partition Name'
smtctl                                   # SMT threads per core
mpstat 2 3                               # per-logical-CPU distribution

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

On a shared POWER9 LPAR, a DataFlowEngine that looks CPU-starved often is not:
the partition is capped at its entitled capacity, or the shared pool is
contended. Sustained `%entc` above 100 with high `%idle` inside the LPAR means
the hypervisor is the constraint, and no amount of ACE tuning will help — the
fix is entitlement or virtual processors, and that is a different team. Rule this
out before recommending additional instances, which will make contention worse.

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
