import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  acknowledgeIepDocument,
  fetchGoals,
  fetchIepDocuments,
  iepDownloadUrl,
  queryKeys,
} from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useSelectedChild } from '../../hooks/useMyChildren'
import ChildSwitcher from '../../components/ChildSwitcher'
import GoalCard from '../../components/GoalCard'
import { EmptyState, ErrorState, LoadingCards } from '../../components/QueryState'
import NoChildYet from '../../components/NoChildYet'
import SignedFileLink from '../../components/SignedFileLink'

/**
 * Goals & IEP for a parent — docs/Figma Pages Design/Parent Goals & IEP.png.
 *
 * Read-only by design. A parent contributes through home observations and
 * messages; the school's plan for their child is written by the school, and
 * the parent sees exactly what the staff see. No separate parent-facing
 * summary that could drift from the real thing.
 */
export default function GoalsAndIep() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const {
    children,
    child,
    selectChild,
    isPending: childrenPending,
    isError: childrenError,
    error: childrenErrorObject,
  } = useSelectedChild()

  const goals = useQuery({
    queryKey: queryKeys.goals(child?.id ?? ''),
    queryFn: () => fetchGoals(child!.id),
    enabled: Boolean(child),
  })

  const documents = useQuery({
    queryKey: queryKeys.iepDocuments(child?.id ?? ''),
    queryFn: () => fetchIepDocuments(child!.id),
    enabled: Boolean(child),
  })

  const acknowledge = useMutation({
    mutationFn: (documentId: string) => acknowledgeIepDocument(documentId),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.iepDocuments(child!.id),
      }),
  })

  if (childrenPending) return <LoadingCards count={2} />

  /*
   * A FAILED LOOKUP IS NOT AN EMPTY ONE.
   *
   * `isError` was dropped from the destructure above, so a children query that
   * FAILED left `child` undefined and fell straight through to NoChildYet —
   * which tells a family "Your account is set up. No child is linked to it
   * yet" and hands them a Link a child button.
   *
   * That is a confident false statement about their own child, made to the
   * person least able to check it, and it sends them back through a linking
   * flow they have already completed. Five of the seven parent screens did
   * this.
   */
  if (childrenError) {
    return (
      <ErrorState
        message={
          childrenErrorObject?.message ??
          'Your children could not be loaded. This is a problem reaching the server, not a change to who is linked to your account.'
        }
      />
    )
  }

  if (!child) {
    return (
      <NoChildYet thing="Goals and IEP documents" />
    )
  }

  const active = (goals.data ?? []).filter(
    (g) => g.status !== 'achieved' && g.status !== 'discontinued',
  )
  const finished = (goals.data ?? []).filter(
    (g) => g.status === 'achieved' || g.status === 'discontinued',
  )

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-title text-foreground">Goals &amp; IEP</h1>
        <p className="mt-1 text-muted-foreground">
          What the school is working on with {child.display_name}, and the
          documents that go with it.
        </p>
      </header>

      <ChildSwitcher children={children} child={child} onSelect={selectChild} />


      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-foreground">Active goals</h2>
        {goals.isSuccess && (
          <span className="rounded-btn bg-primary-subtle px-2.5 py-1 text-sm font-semibold text-primary">
            {active.length} active objective{active.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {goals.isPending && <LoadingCards count={2} />}
      {goals.isError && (
        <ErrorState
          message={goals.error.message}
          onRetry={() => void goals.refetch()}
        />
      )}

      {goals.isSuccess && active.length === 0 && (
        <EmptyState
          title="No active goals yet"
          detail="Goals are set by your child's teachers and specialists. They will appear here as soon as they are written, along with the steps towards them."
        />
      )}

      {active.length > 0 && (
        <ul className="grid gap-4 lg:grid-cols-2">
          {active.map((goal) => (
            <GoalCard key={goal.id} goal={goal} />
          ))}
        </ul>
      )}

      {finished.length > 0 && (
        <>
          <h2 className="mt-10 mb-3 text-lg font-semibold text-foreground">
            Completed &amp; closed
          </h2>
          <ul className="grid gap-4 lg:grid-cols-2">
            {finished.map((goal) => (
              <GoalCard key={goal.id} goal={goal} />
            ))}
          </ul>
        </>
      )}

      {/* --- IEP documents ------------------------------------------------- */}
      <h2 className="mt-10 mb-3 text-lg font-semibold text-foreground">
        IEP documents
      </h2>

      {documents.isError && <ErrorState message={documents.error.message} />}

      {documents.isSuccess && documents.data.length === 0 && (
        <EmptyState
          title="No documents yet"
          detail="Your child's teachers and specialists register IEP and review documents here. When they do, you can confirm you have read them."
        />
      )}

      {documents.isSuccess && documents.data.length > 0 && (
        <ul className="space-y-3">
          {documents.data.map((document) => {
            const mine = document.iep_acknowledgements.some(
              (a) => a.profile_id === profile?.id,
            )
            return (
              <li
                key={document.id}
                className="rounded-card border border-border bg-card shadow-raised p-4 sm:flex sm:items-center sm:gap-4"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">
                    {document.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(document.document_date).toLocaleDateString(
                      'en-AU',
                      { day: 'numeric', month: 'long', year: 'numeric' },
                    )}
                  </p>
                  {document.notes && (
                    <p className="mt-1 text-sm text-foreground">
                      {document.notes}
                    </p>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-0 sm:ml-auto">
                  {/* Placed BEFORE the confirm button on purpose. Confirming
                      you have read something you were never given a way to
                      open would make the record meaningless. */}
                  {document.storage_path && (
                    <SignedFileLink
                      path={document.storage_path}
                      getUrl={iepDownloadUrl}
                      label="Read the document"
                    />
                  )}
                  {mine ? (
                    <span className="rounded-btn bg-success-subtle px-3 py-2 text-sm font-semibold text-success-foreground">
                      ✓ You confirmed reading this
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => acknowledge.mutate(document.id)}
                      disabled={acknowledge.isPending}
                      className="w-full rounded-btn bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-60 sm:w-auto"
                    >
                      Confirm I have read this
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* This wording is load-bearing. The Figma shows "Sign Document"; what
          the system actually records is that someone pressed a button while
          signed in. Calling that a signature on a legal document would be a
          false claim, so the product says what it really does. */}
      <p className="mt-3 max-w-prose text-xs text-muted-foreground">
        Confirming that you have read a document records the date and time
        against your account. It is not an electronic signature and does not
        replace signing a document where the school requires one.
      </p>
    </div>
  )
}
