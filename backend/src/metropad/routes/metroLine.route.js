import { Router } from 'express'
import * as controller from '../controllers/metroLine.controller.js'
import { protect, authorize } from '../middleware/auth.js'

const router = Router()
router.use(protect)

router.get('/', controller.getAll)
router.get('/:id', controller.getById)
router.post('/', authorize('ADMIN', 'OPERATIONS'), controller.create)
router.put('/:id', authorize('ADMIN', 'OPERATIONS'), controller.update)
router.patch('/:id/status', authorize('ADMIN'), controller.updateStatus)
router.delete('/:id', authorize('ADMIN', 'OPERATIONS'), controller.delete)

export default router
