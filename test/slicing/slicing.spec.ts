describe('Slicing', () => {
  describe('Expression Based Code Reconstruction', () => {
    require('./reconstruct/simple')
  })
  describe('Static Program Slices', () => {
    require('./static/simple')
    require('./static/calls')
  })
})