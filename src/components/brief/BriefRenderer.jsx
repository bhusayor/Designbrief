import React from 'react'
import AgencyDeckRenderer from './renderers/AgencyDeckRenderer'
import TechnicalSpecRenderer from './renderers/TechnicalSpecRenderer'
import CreativeDirectionRenderer from './renderers/CreativeDirectionRenderer'
import SprintPlanRenderer from './renderers/SprintPlanRenderer'
import LeanCanvasRenderer from './renderers/LeanCanvasRenderer'

const RENDERERS = {
  'agency-deck':        AgencyDeckRenderer,
  'technical-spec':     TechnicalSpecRenderer,
  'creative-direction': CreativeDirectionRenderer,
  'sprint-plan':        SprintPlanRenderer,
  'lean-canvas':        LeanCanvasRenderer,
}

export default function BriefRenderer({ result, templateId }) {
  if (!result) return null
  const id = templateId || result._briefTemplateId || 'agency-deck'
  const Renderer = RENDERERS[id] || AgencyDeckRenderer
  return <Renderer result={result} />
}
