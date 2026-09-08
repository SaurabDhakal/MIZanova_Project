import io, re

p = 'src/pages/platformAdmin/Verification.tsx'
s = io.open(p, encoding='utf-8').read()

# --- imports ---------------------------------------------------------------
m = re.search(r"import \{\n((?:.|\n)*?)\} from '\.\./\.\./lib/api'", s)
assert m, 'api import block'
block = m.group(0)
if 'fetchSchools' not in block:
    s = s.replace(block, block.replace("import {\n", "import {\n  fetchSchools,\n", 1), 1)

# --- state + queries -------------------------------------------------------
old = """  const [waitingPage, setWaitingPage] = useState(0)
  const [verifiedPage, setVerifiedPage] = useState(0)"""
assert s.count(old) == 1
s = s.replace(
    old,
    """  const [waitingPage, setWaitingPage] = useState(0)
  const [verifiedPage, setVerifiedPage] = useState(0)
  const [schoolId, setSchoolId] = useState('')""",
    1,
)

old_q = """  const waiting = useQuery({
    queryKey: [...queryKeys.allStaff, 'unverified', waitingPage],
    queryFn: () => fetchStaffPage(false, waitingPage),
    placeholderData: keepPreviousData,
  })

  const verified = useQuery({
    queryKey: [...queryKeys.allStaff, 'verified', verifiedPage],
    queryFn: () => fetchStaffPage(true, verifiedPage),
    placeholderData: keepPreviousData,
  })"""
assert s.count(old_q) == 1
new_q = """  // The school belongs in BOTH keys. Without it, changing the filter shows the
  // previous answer to a different question.
  const waiting = useQuery({
    queryKey: [...queryKeys.allStaff, 'unverified', waitingPage, schoolId],
    queryFn: () => fetchStaffPage(false, waitingPage, schoolId || undefined),
    placeholderData: keepPreviousData,
  })

  const verified = useQuery({
    queryKey: [...queryKeys.allStaff, 'verified', verifiedPage, schoolId],
    queryFn: () => fetchStaffPage(true, verifiedPage, schoolId || undefined),
    placeholderData: keepPreviousData,
  })

  /*
   * Every school, from its own query rather than from the names on this page —
   * a school with nobody awaiting verification must still be selectable, or the
   * filter cannot be used to establish that there is nobody.
   */
  const schools = useQuery({ queryKey: queryKeys.schools, queryFn: fetchSchools })
  const schoolName = (id: string | null) =>
    id === null
      ? null
      : (schools.data?.find((s) => s.id === id)?.name ?? 'Unknown school')"""
s = s.replace(old_q, new_q, 1)

# --- show the school on both rows -----------------------------------------
old_await = """                  {ROLE_CONFIG[person.role].label}
                  {person.email && ` · ${person.email}`}
                  {!person.school_id && ' · no school assigned'}
                </p>"""
assert s.count(old_await) == 1
new_await = """                  {ROLE_CONFIG[person.role].label}
                  {person.email && ` · ${person.email}`}
                </p>
                {/*
                  WHICH SCHOOL, which this screen fetched and never showed.
                  Verifying somebody is an attestation that they may open
                  children's records at a school; without naming it, a reviewer
                  cannot check the person against the roster that will rely on
                  the decision.
                */}
                <p className="text-sm text-muted-foreground">
                  {person.school_id ? (
                    schoolName(person.school_id)
                  ) : (
                    <span className="text-warning-foreground">
                      No school assigned — verifying grants nothing until they
                      have one
                    </span>
                  )}
                </p>"""
s = s.replace(old_await, new_await, 1)

old_ver = """                <p className="text-sm text-muted-foreground">
                  {ROLE_CONFIG[person.role].label}
                  {person.email && ` · ${person.email}`}
                </p>"""
# The awaiting block has already been rewritten, so this now matches only the
# verified one.
assert s.count(old_ver) == 1, s.count(old_ver)
new_ver = """                <p className="text-sm text-muted-foreground">
                  {ROLE_CONFIG[person.role].label}
                  {person.email && ` · ${person.email}`}
                </p>
                <p className="text-sm text-muted-foreground">
                  {person.school_id ? (
                    schoolName(person.school_id)
                  ) : (
                    <span className="text-warning-foreground">
                      No school assigned
                    </span>
                  )}
                </p>"""
s = s.replace(old_ver, new_ver, 1)

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('school shown on both lists')
