export async function setupPlugin({ config, global }) {
    const actionMap = config.action_map.split(',').map(entry => entry.split(':'))
    const actions = await Promise.all(actionMap.map(([actionId]) => getActionDefinition(actionId)))

    const actionDefinitions = []
    actionMap.forEach(([, conversionName], index) => {
        const action = actions[index]
        actionDefinitions.push({
            id: action.id,
            eventDetails: action.steps[0],
            conversionName,
        })
    })

    console.log({ actionDefinitions })

}

async function getActionDefinition(actionId) {
    const response = await posthog.api.get(`/api/projects/@current/actions/${actionId}/`, {
        host: 'http://localhost:8000',
    })
    if (response.status !== 200) {
        throw new Error(`Failed to get action definition for ${actionId}: ${body.detail}`)
    }
    const body = await response.json()
    if (!body.steps || body.steps.length !== 1) {
        throw new Error(`Action ${actionId} should have no more than 1 step (found ${action.steps?.length ?? 0})`)
    }
    return body
}

// export async function exportEvents(events, { config }) {
    // check if the event is an action we care about
// }

// async function uploadConversion(gclid) {

// }
