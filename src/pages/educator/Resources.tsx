import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  acknowledgeResource,
  fetchResources,
  formatBytes,
  queryKeys,
  resourceDownloadUrl,
  type ResourceCategory,
} from '../../lib/api'
import { useAuth } from '../../lib/auth'
import EducatorSchoolContext from '../../components/EducatorSchoolContext'
import Icon from '../../components/Icon'
import SignedFileLink from '../../components/SignedFileLink'
import { EmptyState, ErrorState, LoadingCards } from '../../components/QueryState'

const CATEGORY_LABEL: Record<ResourceCategory, string> = {
  video: 'Video',
  handout: 'Handout',
  aac_board: 'AAC board',
  other: 'Other',
}

/** Materials a specialist has shared with children in this educator's class. */
export default function EducatorResources() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [category, setCategory] = useState<ResourceCategory | ''>('')

  const resources = useQuery({
    queryKey: queryKeys.resources,
    queryFn: fetchResources,
  })

  const acknowledge = useMutation({
    mutationFn: (shareId: string) =>
      acknowledgeResource(shareId, profile!.id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.resources }),
  })

  const visible = (resources.data ?? []).filter(
    (resource) => category === '' || resource.category === category,
  )

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-title text-foreground">Shared resources</h1>
        <p className="mt-1 max-w-prose text-muted-foreground">
          Materials shared by specialists for students you currently support.
          Files remain private and open through short-lived links.
        </p>
        <EducatorSchoolContext />
      </header>

      {resources.isPending && <LoadingCards count={3} />}
      {resources.isError && (
        <ErrorState
          message={resources.error.message}
          onRetry={() => void resources.refetch()}
        />
      )}

      {resources.isSuccess && resources.data.length === 0 && (
        <EmptyState
          title="No resources have been shared yet"
          detail="When a specialist shares a handout, AAC board, recording or video with one of your students, it will appear here."
        />
      )}

      {resources.isSuccess && resources.data.length > 0 && (
        <>
          <label className="mb-4 block max-w-xs text-sm font-medium text-muted-foreground">
            Resource type
            <select
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as ResourceCategory | '')
              }
              className="mt-1 block w-full rounded-btn border border-border bg-card px-3 py-2.5 text-foreground"
            >
              <option value="">All types</option>
              {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          {visible.length === 0 ? (
            <EmptyState
              title="No resources of this type"
              detail="Choose another resource type to see the materials available to you."
            />
          ) : (
            <ul className="grid gap-4 lg:grid-cols-2">
              {visible.map((resource) => (
                <li
                  key={resource.id}
                  className="rounded-card border border-border bg-card p-5 shadow-raised"
                >
                  <div className="flex items-start gap-3">
                    <span className="rounded-btn bg-primary-subtle p-2.5 text-primary">
                      <Icon name="resources" className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <h2 className="font-semibold text-foreground">
                          {resource.title}
                        </h2>
                        <span className="rounded-btn bg-background px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                          {CATEGORY_LABEL[resource.category]}
                        </span>
                      </div>
                      {resource.description && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {resource.description}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {resource.size_bytes == null
                          ? 'File size unavailable'
                          : formatBytes(resource.size_bytes)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <SignedFileLink
                      path={resource.storage_path!}
                      getUrl={resourceDownloadUrl}
                      label="Open resource"
                    />
                  </div>

                  <div className="mt-4 border-t border-border pt-3">
                    <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      Shared for
                    </p>
                    <ul className="mt-2 space-y-2">
                      {resource.resource_shares.map((share) => {
                        const reviewed = share.resource_acknowledgements.some(
                          (row) => row.profile_id === profile?.id,
                        )
                        return (
                          <li
                            key={share.id}
                            className="flex flex-wrap items-center gap-2 text-sm"
                          >
                            <span className="font-medium text-foreground">
                              {share.students
                                ? `${share.students.first_name} ${share.students.last_name}`
                                : 'A student you support'}
                            </span>
                            <span className="ml-auto">
                              {reviewed ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-success-foreground">
                                  <Icon name="tick" className="h-3.5 w-3.5" />
                                  Reviewed
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => acknowledge.mutate(share.id)}
                                  disabled={acknowledge.isPending}
                                  className="rounded-btn border border-border px-2.5 py-1.5 text-xs font-semibold text-primary disabled:opacity-60"
                                >
                                  {acknowledge.isPending &&
                                  acknowledge.variables === share.id
                                    ? 'Saving…'
                                    : 'Mark reviewed'}
                                </button>
                              )}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                    {acknowledge.isError &&
                      resource.resource_shares.some(
                        (share) => share.id === acknowledge.variables,
                      ) && (
                      <p role="alert" className="mt-2 text-sm text-danger-foreground">
                        {acknowledge.error.message}
                      </p>
                      )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
